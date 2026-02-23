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
import { FirecrawlClient, createFirecrawlClient } from './firecrawl/client'
import { SlackClient, createSlackClient } from './slack/client'

// Types
export * from './types'

// Credentials retrieval
export {
  getIntegrationCredentials,
  getIntegrationCredentialsAdmin,
  isIntegrationConfigured,
  isIntegrationConfiguredAdmin,
  type IntegrationCredentials
} from './credentials'

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
  getMtuProductId,
  getMtuMeterId,
  // Price fetching
  getActivePrice,
  getPriceFromSubscription,
  // Types
  type BillingResult,
  type CreateCustomerParams,
  type CreateSubscriptionParams,
  type RecordMeterEventParams,
  type SetupIntentResult,
  type PaymentMethodInfo,
  type BillingPortalSessionResult,
  type PriceInfo,
} from './stripe/billing'

// Apollo
export { ApolloClient, createApolloClient, type ApolloClientConfig, type ApolloSearchResult } from './apollo/client'

// Firecrawl
export {
  FirecrawlClient,
  createFirecrawlClient,
  FirecrawlError,
  FirecrawlAuthError,
  FirecrawlRateLimitError,
  FirecrawlPaymentError,
  type FirecrawlClientConfig,
  type ScrapeOptions,
  type ScrapeResult,
  type ScrapeResponse,
  type ScrapeMetadata,
  type CrawlOptions,
  type CrawlResponse,
  type ExtractOptions,
  type ExtractResponse,
} from './firecrawl'

// Slack
export {
  SlackClient,
  createSlackClient,
  SlackError,
  SlackAuthError,
  SlackRateLimitError,
  SlackChannelError,
  type SlackClientConfig,
  type SlackChannel,
  type SlackConnectionResult,
  type SlackPostResult,
  type SlackConfigJson,
} from './slack'

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
  name: 'posthog' | 'stripe' | 'apollo' | 'firecrawl' | 'slack',
  config: Record<string, string>
): PostHogClient | StripeClient | ApolloClient | FirecrawlClient | SlackClient {
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

    case 'firecrawl':
      if (!config.apiKey) {
        throw new Error('Firecrawl requires apiKey')
      }
      return createFirecrawlClient({
        apiKey: config.apiKey,
        mode: (config.mode as 'cloud' | 'self_hosted') || 'cloud',
        baseUrl: config.baseUrl,
        proxy: (config.proxy as 'basic' | 'stealth') || null,
      })

    case 'slack':
      if (!config.botToken) {
        throw new Error('Slack requires botToken')
      }
      return createSlackClient({ botToken: config.botToken })

    default:
      throw new Error(`Unknown integration: ${name}`)
  }
}
