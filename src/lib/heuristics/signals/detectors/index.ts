/**
 * Signal Detectors Index
 * Exports all 25 signal detectors organized by category
 */

// Expansion signals
export { usageSpikeDetector } from './usage-spike'
export { nearingPaywallDetector } from './nearing-paywall'
export { directorSignupDetector } from './director-signup'
export { invitesSentDetector } from './invites-sent'
export { newDepartmentUserDetector } from './new-department-user'
export { highNPSDetector } from './high-nps'
export { trialEndingDetector } from './trial-ending'
export { upcomingRenewalDetector } from './upcoming-renewal'
export { freeDecisionMakerDetector } from './free-decision-maker'
export { upgradePageVisitDetector } from './upgrade-page-visit'
export { approachingSeatLimitDetector } from './approaching-seat-limit'
export { overageDetector } from './overage'

// HubSpot expansion signals
export { hubspotDealStageChangeDetector } from './hubspot-deal-stage-change'
export { hubspotNewDealDetector } from './hubspot-new-deal'
export { hubspotLifecycleChangeDetector } from './hubspot-lifecycle-change'
export { hubspotMeetingBookedDetector } from './hubspot-meeting-booked'

// Churn risk signals
export { usageDropDetector } from './usage-drop'
export { lowNPSDetector } from './low-nps'
export { inactivityDetector } from './inactivity'
export { usageWoWDeclineDetector } from './usage-wow-decline'
export { healthScoreDecreaseDetector } from './health-score-decrease'
export { arrDecreaseDetector } from './arr-decrease'
export { incompleteOnboardingDetector } from './incomplete-onboarding'
export { futureCancellationDetector } from './future-cancellation'

// HubSpot churn risk signals
export { hubspotTicketCreatedDetector } from './hubspot-ticket-created'

import type { SignalDetectorDefinition } from '../types'

import { usageSpikeDetector } from './usage-spike'
import { nearingPaywallDetector } from './nearing-paywall'
import { directorSignupDetector } from './director-signup'
import { invitesSentDetector } from './invites-sent'
import { newDepartmentUserDetector } from './new-department-user'
import { highNPSDetector } from './high-nps'
import { trialEndingDetector } from './trial-ending'
import { upcomingRenewalDetector } from './upcoming-renewal'
import { freeDecisionMakerDetector } from './free-decision-maker'
import { upgradePageVisitDetector } from './upgrade-page-visit'
import { approachingSeatLimitDetector } from './approaching-seat-limit'
import { overageDetector } from './overage'
import { hubspotDealStageChangeDetector } from './hubspot-deal-stage-change'
import { hubspotNewDealDetector } from './hubspot-new-deal'
import { hubspotLifecycleChangeDetector } from './hubspot-lifecycle-change'
import { hubspotMeetingBookedDetector } from './hubspot-meeting-booked'
import { usageDropDetector } from './usage-drop'
import { lowNPSDetector } from './low-nps'
import { inactivityDetector } from './inactivity'
import { usageWoWDeclineDetector } from './usage-wow-decline'
import { healthScoreDecreaseDetector } from './health-score-decrease'
import { arrDecreaseDetector } from './arr-decrease'
import { incompleteOnboardingDetector } from './incomplete-onboarding'
import { futureCancellationDetector } from './future-cancellation'
import { hubspotTicketCreatedDetector } from './hubspot-ticket-created'

/**
 * All expansion signal detectors
 */
export const expansionDetectors: SignalDetectorDefinition[] = [
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
  // HubSpot expansion signals
  hubspotDealStageChangeDetector,
  hubspotNewDealDetector,
  hubspotLifecycleChangeDetector,
  hubspotMeetingBookedDetector,
]

/**
 * All churn risk signal detectors
 */
export const churnRiskDetectors: SignalDetectorDefinition[] = [
  usageDropDetector,
  lowNPSDetector,
  inactivityDetector,
  usageWoWDeclineDetector,
  healthScoreDecreaseDetector,
  arrDecreaseDetector,
  incompleteOnboardingDetector,
  futureCancellationDetector,
  // HubSpot churn risk signals
  hubspotTicketCreatedDetector,
]

/**
 * All signal detectors (25 total)
 */
export const allDetectors: SignalDetectorDefinition[] = [
  ...expansionDetectors,
  ...churnRiskDetectors,
]

/**
 * Get detector by name
 */
export function getDetectorByName(name: string): SignalDetectorDefinition | undefined {
  return allDetectors.find((d) => d.meta.name === name)
}

/**
 * Get detectors by category
 */
export function getDetectorsByCategory(
  category: 'expansion' | 'churn_risk'
): SignalDetectorDefinition[] {
  return category === 'expansion' ? expansionDetectors : churnRiskDetectors
}
