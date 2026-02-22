'use client'

import { useState, useCallback } from 'react'

/**
 * Generic state machine hook for multi-phase validation steps.
 *
 * Every onboarding step shares the same lifecycle:
 *   idle → (custom phases) → success | error
 *
 * The type parameter `P` declares custom phase names so each step
 * gets full type safety for its own phases while sharing the core.
 *
 * @example
 * ```tsx
 * // PostHogStep with two custom phases:
 * const v = useStepValidation<'validating' | 'calculating_mtu'>()
 *
 * v.startPhase('validating')
 * await validateCredentials()
 * v.startPhase('calculating_mtu')
 * await calculateMtu()
 * v.succeed()
 * ```
 */
export interface UseStepValidationReturn<P extends string> {
  /** Current phase of the validation lifecycle */
  phase: 'idle' | 'success' | 'error' | P
  /** Error message when phase is 'error', null otherwise */
  error: string | null
  /** True when phase is 'idle' */
  isIdle: boolean
  /** True when phase is any custom phase (not idle/success/error) */
  isLoading: boolean
  /** True when phase is 'success' */
  isSuccess: boolean
  /** True when phase is 'error' */
  isError: boolean
  /** Transition to a custom phase and clear any error */
  startPhase: (phase: P) => void
  /** Transition to 'success' */
  succeed: () => void
  /** Transition to 'error' with a message */
  fail: (message: string) => void
  /** Reset to 'idle' and clear error */
  reset: () => void
}

export function useStepValidation<
  P extends string = never,
>(): UseStepValidationReturn<P> {
  const [phase, setPhase] = useState<'idle' | 'success' | 'error' | P>('idle')
  const [error, setError] = useState<string | null>(null)

  const startPhase = useCallback((p: P) => {
    setPhase(p)
    setError(null)
  }, [])

  const succeed = useCallback(() => {
    setPhase('success')
  }, [])

  const fail = useCallback((msg: string) => {
    setPhase('error')
    setError(msg)
  }, [])

  const reset = useCallback(() => {
    setPhase('idle')
    setError(null)
  }, [])

  return {
    phase,
    error,
    isIdle: phase === 'idle',
    isLoading: phase !== 'idle' && phase !== 'success' && phase !== 'error',
    isSuccess: phase === 'success',
    isError: phase === 'error',
    startPhase,
    succeed,
    fail,
    reset,
  }
}
