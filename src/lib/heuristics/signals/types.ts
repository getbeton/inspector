/**
 * Types for signal detection system
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = import('@supabase/supabase-js').SupabaseClient<any, any, any>

/**
 * Signal detection result
 */
export interface DetectedSignal {
  account_id: string
  workspace_id: string
  type: string
  value: number | null
  details: Record<string, unknown>
  source: string
}

/**
 * Signal detector configuration
 */
export interface SignalDetectorConfig {
  // Time window for detecting signals (days)
  time_window_days?: number
  // Threshold for triggering signal (can be negative for decline detectors)
  threshold?: number
  // Days to look back for deduplication
  lookback_days?: number
  // Threshold in days for time-based detectors
  threshold_days?: number
  // Trial period length in days
  trial_period?: number
  // Contract period length in days
  contract_period?: number
  // Page URL patterns to match
  page_patterns?: string[]
}

/**
 * Context passed to signal detectors
 */
export interface DetectorContext {
  supabase: AnySupabaseClient
  workspaceId: string
  config?: SignalDetectorConfig
}

/**
 * Signal detector function signature
 */
export type SignalDetector = (
  accountId: string,
  context: DetectorContext
) => Promise<DetectedSignal | null>

/**
 * Signal detector metadata
 */
export interface SignalDetectorMeta {
  name: string
  category: 'expansion' | 'churn_risk'
  description: string
  defaultConfig: SignalDetectorConfig
}

/**
 * Complete signal detector definition
 */
export interface SignalDetectorDefinition {
  meta: SignalDetectorMeta
  detect: SignalDetector
}

/**
 * Account data needed for detection
 */
export interface AccountData {
  id: string
  workspace_id: string
  name: string | null
  domain: string | null
  plan: string | null
  status: string | null
  arr: number
  health_score: number | null
  fit_score: number | null
  last_activity_at: string | null
  created_at: string
}

/**
 * User data for detection
 */
export interface UserData {
  id: string
  account_id: string
  name: string | null
  email: string | null
  title: string | null
  created_at: string
}
