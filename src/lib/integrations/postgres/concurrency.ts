/**
 * Per-data-source concurrency limiter.
 *
 * Limits the number of simultaneous Postgres connections per data source
 * to protect users' databases from connection exhaustion. Uses an in-memory
 * semaphore pattern (similar to the existing rate limiter).
 *
 * Default: max 3 concurrent connections per data source.
 */

const DEFAULT_MAX_CONCURRENT = 3
const ACQUIRE_TIMEOUT_MS = 5_000 // Wait up to 5s for a slot

interface SemaphoreState {
  active: number
  waiters: Array<{
    resolve: () => void
    reject: (err: Error) => void
    timer: ReturnType<typeof setTimeout>
  }>
}

const semaphores = new Map<string, SemaphoreState>()

function getOrCreateState(dataSourceId: string): SemaphoreState {
  let state = semaphores.get(dataSourceId)
  if (!state) {
    state = { active: 0, waiters: [] }
    semaphores.set(dataSourceId, state)
  }
  return state
}

/**
 * Acquire a connection slot for a data source.
 * If the max is reached, waits up to ACQUIRE_TIMEOUT_MS for a slot.
 * @throws Error if the timeout is reached
 */
export function acquireConnectionSlot(
  dataSourceId: string,
  maxConcurrent = DEFAULT_MAX_CONCURRENT,
): Promise<void> {
  const state = getOrCreateState(dataSourceId)

  if (state.active < maxConcurrent) {
    state.active++
    return Promise.resolve()
  }

  // Queue the request
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      // Remove this waiter on timeout
      const idx = state.waiters.findIndex((w) => w.resolve === resolve)
      if (idx >= 0) state.waiters.splice(idx, 1)
      reject(
        new Error(
          `Connection pool exhausted for data source ${dataSourceId} — max ${maxConcurrent} concurrent connections`,
        ),
      )
    }, ACQUIRE_TIMEOUT_MS)

    state.waiters.push({ resolve, reject, timer })
  })
}

/**
 * Release a connection slot for a data source.
 * If there are queued waiters, the next one gets the slot.
 */
export function releaseConnectionSlot(dataSourceId: string): void {
  const state = semaphores.get(dataSourceId)
  if (!state) return

  if (state.waiters.length > 0) {
    // Give the slot to the next waiter
    const waiter = state.waiters.shift()!
    clearTimeout(waiter.timer)
    waiter.resolve()
  } else {
    state.active--
    if (state.active <= 0) {
      // Clean up empty semaphores to prevent memory leaks
      semaphores.delete(dataSourceId)
    }
  }
}

/**
 * Get current concurrency stats for a data source (for monitoring/debugging).
 */
export function getConnectionStats(dataSourceId: string): {
  active: number
  waiting: number
} {
  const state = semaphores.get(dataSourceId)
  if (!state) return { active: 0, waiting: 0 }
  return { active: state.active, waiting: state.waiters.length }
}
