/**
 * Signal Processor
 * Runs signal detectors against accounts and persists detected signals
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = import('@supabase/supabase-js').SupabaseClient<any, any, any>
import type { DetectedSignal, DetectorContext, SignalDetectorDefinition } from './types'
import { allDetectors, getDetectorsByCategory } from './detectors'

export interface ProcessorOptions {
  /**
   * Which detectors to run: 'all', 'expansion', or 'churn_risk'
   */
  category?: 'all' | 'expansion' | 'churn_risk'

  /**
   * Custom detector configurations keyed by detector name
   */
  configs?: Record<string, Record<string, unknown>>

  /**
   * If true, don't persist signals, just return detected ones
   */
  dryRun?: boolean
}

export interface ProcessorResult {
  accountId: string
  detected: DetectedSignal[]
  persisted: number
  errors: string[]
}

/**
 * Process signals for a single account
 */
export async function processAccountSignals(
  supabase: AnySupabaseClient,
  accountId: string,
  workspaceId: string,
  options: ProcessorOptions = {}
): Promise<ProcessorResult> {
  const { category = 'all', configs = {}, dryRun = false } = options

  const result: ProcessorResult = {
    accountId,
    detected: [],
    persisted: 0,
    errors: [],
  }

  // Select detectors to run
  let detectors: SignalDetectorDefinition[]
  if (category === 'all') {
    detectors = allDetectors
  } else {
    detectors = getDetectorsByCategory(category)
  }

  // Run each detector
  for (const detector of detectors) {
    try {
      const context: DetectorContext = {
        supabase,
        workspaceId,
        config: {
          ...detector.meta.defaultConfig,
          ...configs[detector.meta.name],
        },
      }

      const signal = await detector.detect(accountId, context)

      if (signal) {
        result.detected.push(signal)

        // Persist if not dry run
        if (!dryRun) {
          const { error } = await supabase.from('signals').insert({
            account_id: signal.account_id,
            workspace_id: signal.workspace_id,
            type: signal.type,
            value: signal.value,
            details: signal.details,
            source: signal.source,
            timestamp: new Date().toISOString(),
          })

          if (error) {
            result.errors.push(`Failed to persist ${signal.type}: ${error.message}`)
          } else {
            result.persisted++
          }
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      result.errors.push(`${detector.meta.name}: ${errorMsg}`)
    }
  }

  return result
}

/**
 * Process signals for multiple accounts (batch processing)
 */
export async function processAllAccounts(
  supabase: AnySupabaseClient,
  workspaceId: string,
  options: ProcessorOptions & { limit?: number } = {}
): Promise<{
  processed: number
  totalDetected: number
  totalPersisted: number
  totalErrors: number
  results: ProcessorResult[]
}> {
  const { limit = 100, ...processorOptions } = options

  // Get accounts for the workspace
  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('id')
    .eq('workspace_id', workspaceId)
    .limit(limit)

  if (error || !accounts) {
    return {
      processed: 0,
      totalDetected: 0,
      totalPersisted: 0,
      totalErrors: 1,
      results: [],
    }
  }

  const results: ProcessorResult[] = []
  let totalDetected = 0
  let totalPersisted = 0
  let totalErrors = 0

  // Process each account
  for (const account of accounts) {
    const result = await processAccountSignals(
      supabase,
      account.id,
      workspaceId,
      processorOptions
    )

    results.push(result)
    totalDetected += result.detected.length
    totalPersisted += result.persisted
    totalErrors += result.errors.length
  }

  return {
    processed: accounts.length,
    totalDetected,
    totalPersisted,
    totalErrors,
    results,
  }
}

/**
 * Get summary of all available detectors
 */
export function getDetectorSummary(): Array<{
  name: string
  category: string
  description: string
}> {
  return allDetectors.map((d) => ({
    name: d.meta.name,
    category: d.meta.category,
    description: d.meta.description,
  }))
}
