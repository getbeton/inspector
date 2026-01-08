/**
 * Signal Detection System
 *
 * This module provides 20 signal detectors for identifying expansion opportunities
 * and churn risks based on product usage patterns.
 *
 * @example
 * ```typescript
 * import { processAccountSignals, allDetectors } from '@/lib/heuristics/signals'
 *
 * // Process all signals for an account
 * const result = await processAccountSignals(supabase, accountId, workspaceId)
 *
 * // Process only expansion signals
 * const result = await processAccountSignals(supabase, accountId, workspaceId, {
 *   category: 'expansion'
 * })
 * ```
 */

// Types
export type {
  DetectedSignal,
  SignalDetectorConfig,
  DetectorContext,
  SignalDetector,
  SignalDetectorMeta,
  SignalDetectorDefinition,
  AccountData,
  UserData,
} from './types'

// Helpers
export {
  signalExists,
  getAccount,
  getAccountUsers,
  countSignals,
  getLatestSignal,
  createDetectedSignal,
  calculatePercentageChange,
  isDirectorLevel,
  daysAgo,
  daysBetween,
} from './helpers'

// All detectors
export {
  // Expansion detectors
  usageSpikeDetector,
  nearingPaywallDetector,
  directorSignupDetector,
  invitesSentDetector,
  newDepartmentUserDetector,
  highNPSDetector,
  trialEndingDetector,
  upcomingRenewalDetector,
  freeDecisionMakerDetector,
  upgradePageVisitDetector,
  approachingSeatLimitDetector,
  overageDetector,
  // Churn risk detectors
  usageDropDetector,
  lowNPSDetector,
  inactivityDetector,
  usageWoWDeclineDetector,
  healthScoreDecreaseDetector,
  arrDecreaseDetector,
  incompleteOnboardingDetector,
  futureCancellationDetector,
  // Detector collections
  expansionDetectors,
  churnRiskDetectors,
  allDetectors,
  getDetectorByName,
  getDetectorsByCategory,
} from './detectors'

// Processor
export {
  processAccountSignals,
  processAllAccounts,
  getDetectorSummary,
} from './processor'

export type { ProcessorOptions, ProcessorResult } from './processor'
