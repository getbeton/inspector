/**
 * Analytics Module
 *
 * Central export for all analytics utilities.
 * Import from '@/lib/analytics' for consistent access.
 */

export {
  pushToDataLayer,
  trackEvent,
  trackPageView,
  identifyUser,
  setWorkspaceContext,
  trackSignup,
  trackLogin,
  resetIdentity,
  trackDemoTourStarted,
  trackDemoTourCompleted,
  trackSetupStarted,
  trackSetupStepCompleted,
  trackIntegrationConnected,
  trackCardLinked,
  trackFirstSignalViewed,
  trackOnboardingCompleted,
} from './gtm'

export { usePostHogIdentify } from './use-posthog-identify'
