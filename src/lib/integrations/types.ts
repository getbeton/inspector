/**
 * Common types for integration clients
 */

export interface IntegrationClient {
  testConnection(): Promise<boolean>
}

export interface PostHogEvent {
  id: string
  distinct_id: string
  event: string
  timestamp: string
  properties: Record<string, unknown>
}

export interface PostHogPerson {
  id: string
  distinct_ids: string[]
  properties: Record<string, unknown>
  created_at: string
}

export interface PostHogGroup {
  group_type: string
  group_key: string
  properties: Record<string, unknown>
}

export interface StripeCustomer {
  id: string
  email: string | null
  name: string | null
  metadata: Record<string, string>
  created: number
  subscriptions?: {
    data: StripeSubscription[]
  }
}

export interface StripeSubscription {
  id: string
  customer: string
  status: 'active' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'past_due' | 'trialing' | 'unpaid' | 'paused'
  current_period_start: number
  current_period_end: number
  items: {
    data: StripeSubscriptionItem[]
  }
  metadata: Record<string, string>
}

export interface StripeSubscriptionItem {
  id: string
  price: {
    id: string
    unit_amount: number | null
    currency: string
    recurring: {
      interval: 'day' | 'week' | 'month' | 'year'
      interval_count: number
    } | null
  }
  quantity: number
}

export interface StripeInvoice {
  id: string
  customer: string
  status: string
  amount_paid: number
  amount_due: number
  created: number
  period_start: number
  period_end: number
}

export interface ApolloContact {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  title: string | null
  linkedin_url: string | null
  organization: ApolloOrganization | null
}

export interface ApolloOrganization {
  id: string
  name: string | null
  website_url: string | null
  industry: string | null
  estimated_num_employees: number | null
  linkedin_url: string | null
}

export interface AttioRecord {
  id: string
  values: Record<string, AttioAttributeValue[]>
}

export interface AttioAttributeValue {
  attribute_id: string
  value: unknown
}

export interface IntegrationError extends Error {
  code?: string
  statusCode?: number
  isRetryable: boolean
}

export function createIntegrationError(
  message: string,
  code?: string,
  statusCode?: number,
  isRetryable = false
): IntegrationError {
  const error = new Error(message) as IntegrationError
  error.code = code
  error.statusCode = statusCode
  error.isRetryable = isRetryable
  return error
}
