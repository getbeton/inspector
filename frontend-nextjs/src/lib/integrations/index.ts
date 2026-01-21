/**
 * Integration clients index
 *
 * This module exports all integration clients for external services:
 * - PostHog: Product analytics and event tracking
 * - Stripe: Payment processing and subscription management
 * - Apollo: Contact enrichment and company data
 * - Attio: CRM synchronization
 */

// Import clients first for factory function
import { PostHogClient, createPostHogClient } from './posthog/client'
import { StripeClient, createStripeClient } from './stripe/client'
import { ApolloClient, createApolloClient } from './apollo/client'

// Types
export * from './types'

// PostHog
export { PostHogClient, createPostHogClient, type PostHogClientConfig } from './posthog/client'

// Stripe
export { StripeClient, createStripeClient, type StripeClientConfig } from './stripe/client'

// Stripe Billing (MTU-based billing operations)
export {
  // Error types
  StripeBillingError,
  StripeCardDeclinedError,
  StripeInvalidRequestError,
  StripeAuthenticationError,
  StripeRateLimitError,
  StripeBillingDisabledError,
  // Functions
  createCustomer as createBillingCustomer,
  getCustomer as getBillingCustomer,
  updateCustomer as updateBillingCustomer,
  createSubscription as createBillingSubscription,
  getSubscription as getBillingSubscription,
  cancelSubscription as cancelBillingSubscription,
  pauseSubscription as pauseBillingSubscription,
  resumeSubscription as resumeBillingSubscription,
  recordMeterEvent,
  createSetupIntent,
  listPaymentMethods,
  setDefaultPaymentMethod,
  createBillingPortalSession,
  constructWebhookEvent,
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
} from './stripe/billing'

// Apollo
export { ApolloClient, createApolloClient, type ApolloClientConfig, type ApolloSearchResult } from './apollo/client'

// Attio (explicit exports to avoid naming conflicts with ./types)
export {
  AttioError,
  AttioAuthError,
  AttioRateLimitError,
  AttioNotFoundError,
  AttioValidationError,
  type AttioObject,
  type AttioAttribute,
  type AttioRecord as AttioRecordData,
  type AttioUpsertResult,
  type AttioConnectionResult,
  type AttioHealthResult,
  validateConnection as validateAttioConnection,
  discoverObjects as discoverAttioObjects,
  getObjectAttributes as getAttioObjectAttributes,
  createAttribute as createAttioAttribute,
  upsertRecord as upsertAttioRecord,
  getRecord as getAttioRecord,
  searchRecords as searchAttioRecords,
  healthCheck as attioHealthCheck,
  testConnection as testAttioConnection,
} from './attio'

/**
 * Integration factory - creates the appropriate client based on integration name
 */
export function createIntegrationClient(
  name: 'posthog' | 'stripe' | 'apollo',
  config: Record<string, string>
): PostHogClient | StripeClient | ApolloClient {
  switch (name) {
    case 'posthog':
      if (!config.apiKey || !config.projectId) {
        throw new Error('PostHog requires apiKey and projectId')
      }
      return createPostHogClient(config.apiKey, config.projectId, config.host)

    case 'stripe':
      if (!config.apiKey) {
        throw new Error('Stripe requires apiKey')
      }
      return createStripeClient(config.apiKey)

    case 'apollo':
      if (!config.apiKey) {
        throw new Error('Apollo requires apiKey')
      }
      return createApolloClient(config.apiKey)

    default:
      throw new Error(`Unknown integration: ${name}`)
  }
}
