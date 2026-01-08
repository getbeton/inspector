/**
 * Integration clients index
 *
 * This module exports all integration clients for external services:
 * - PostHog: Product analytics and event tracking
 * - Stripe: Payment processing and subscription management
 * - Apollo: Contact enrichment and company data
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

// Apollo
export { ApolloClient, createApolloClient, type ApolloClientConfig, type ApolloSearchResult } from './apollo/client'

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
