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
  trackOnboardingStepViewed,
  trackSetupStepCompleted,
  trackOnboardingStepSkipped,
  trackIntegrationConnected,
  trackIntegrationConnectionFailed,
  trackPostHogSelfHostedSelected,
  trackFirecrawlProxyTierSelected,
  trackCardLinked,
  trackFirstSignalViewed,
  trackOnboardingCompleted,
  trackAttioEntityCreated,
  trackAttioEntityCreationFailed,
  trackAttioContactPickerUsed,
  setOnboardingUserProperties,
} from './gtm'

export { usePostHogIdentify } from './use-posthog-identify'
