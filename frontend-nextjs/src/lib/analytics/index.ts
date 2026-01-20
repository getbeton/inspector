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
  resetIdentity
} from './gtm'

export { usePostHogIdentify } from './use-posthog-identify'
