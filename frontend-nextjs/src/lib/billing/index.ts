/**
 * Billing Module
 *
 * Handles MTU-based billing for Beton Inspector cloud deployments.
 * All billing features are automatically disabled in self-hosted mode.
 */

// MTU Calculation Service
export {
  calculateMTU,
  getMTUHistory,
  getCurrentBillingCycleMTU,
  getThresholdStatus,
  storeMTUTracking,
  markMtuAsReportedToStripe,
  getUnreportedMtuRecords,
  invalidateCache as invalidateMtuCache,
  type MTUResult,
  type MTUHistory,
  type ThresholdStatus,
  type MTUCalculationOptions,
} from './mtu-service';

// Billing Cycle Management Service
export {
  // Functions
  initializeBillingCycle,
  getCurrentBillingCycle,
  getNextBillingCycle,
  isBillingCycleEnding,
  getDaysRemainingInCycle,
  transitionToNextCycle,
  hasCycleEnded,
  getWorkspacesNeedingCycleTransition,
  // Date utilities
  calculateCycleEndDate,
  getDaysBetween,
  isDateInCycle,
  // Types
  type BillingCycle,
  type BillingCycleInfo,
  type CycleTransitionResult,
} from './cycle-service';

// Billing Enforcement Service
export {
  // Main functions
  getAccessStatus,
  checkAccess,
  isOverThreshold,
  requiresCardLink,
  getBlockReason,
  getThresholdPercentage,
  getThresholdWarningLevel,
  // API route helpers
  enforceAccess,
  checkAccessForRequest,
  // Types
  type AccessStatus,
  type AccessCheckResult,
  type AccessStatusType,
} from './enforcement-service';

// Re-export deployment utilities for convenience
export {
  isBillingEnabled,
  isCloudDeployment,
  isSelfHosted,
  shouldTrackMtu,
  shouldUseStripe,
  getMtuLimit,
  BILLING_CONFIG,
} from '@/lib/utils/deployment';

// Re-export Stripe billing functions
export {
  // Error types
  StripeBillingError,
  StripeCardDeclinedError,
  StripeInvalidRequestError,
  StripeAuthenticationError,
  StripeRateLimitError,
  StripeBillingDisabledError,
  // Customer operations
  createCustomer as createBillingCustomer,
  getCustomer as getBillingCustomer,
  updateCustomer as updateBillingCustomer,
  // Subscription operations
  createSubscription as createBillingSubscription,
  getSubscription as getBillingSubscription,
  cancelSubscription as cancelBillingSubscription,
  pauseSubscription as pauseBillingSubscription,
  resumeSubscription as resumeBillingSubscription,
  // Meter operations
  recordMeterEvent,
  // Payment operations
  createSetupIntent,
  listPaymentMethods,
  setDefaultPaymentMethod,
  createBillingPortalSession,
  // Webhook
  constructWebhookEvent,
  // Utilities
  isBillingConfigured,
  getMtuPriceId,
  getMtuMeterId,
  // Types
  type BillingResult,
  type CreateCustomerParams,
  type CreateSubscriptionParams,
  type RecordMeterEventParams,
  type SetupIntentResult,
  type PaymentMethodInfo,
  type BillingPortalSessionResult,
} from '@/lib/integrations/stripe/billing';
