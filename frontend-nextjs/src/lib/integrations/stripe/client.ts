/**
 * Stripe API client for fetching customers, subscriptions, invoices, and MRR data
 */

import Stripe from 'stripe'
import { StripeCustomer, StripeSubscription, StripeInvoice, createIntegrationError } from '../types'

export interface StripeClientConfig {
  apiKey: string
}

export class StripeClient {
  private client: Stripe
  private apiKey: string

  constructor(config: StripeClientConfig) {
    if (!config.apiKey) {
      throw createIntegrationError('Stripe API key is required', 'INVALID_CONFIG')
    }

    this.apiKey = config.apiKey
    this.client = new Stripe(config.apiKey)
  }

  /**
   * Fetch customers with automatic pagination
   */
  async getCustomers(limit = 100): Promise<StripeCustomer[]> {
    try {
      const customers: StripeCustomer[] = []

      for await (const customer of this.client.customers.list({ limit: Math.min(limit, 100) })) {
        customers.push(this.mapCustomer(customer))
        if (customers.length >= limit) break
      }

      return customers
    } catch (error) {
      throw this.handleError(error, 'fetching customers')
    }
  }

  /**
   * Get a specific customer by ID
   */
  async getCustomer(customerId: string): Promise<StripeCustomer | null> {
    try {
      const customer = await this.client.customers.retrieve(customerId, {
        expand: ['subscriptions'],
      })

      if (customer.deleted) return null
      return this.mapCustomer(customer as Stripe.Customer)
    } catch (error) {
      if ((error as Stripe.errors.StripeError).code === 'resource_missing') {
        return null
      }
      throw this.handleError(error, 'fetching customer')
    }
  }

  /**
   * Fetch subscriptions, optionally filtered by customer
   */
  async getSubscriptions(options: {
    customerId?: string
    status?: Stripe.Subscription.Status
    limit?: number
  } = {}): Promise<StripeSubscription[]> {
    try {
      const { customerId, status, limit = 100 } = options
      const subscriptions: StripeSubscription[] = []

      const params: Stripe.SubscriptionListParams = {
        limit: Math.min(limit, 100),
      }

      if (customerId) params.customer = customerId
      if (status) params.status = status

      for await (const subscription of this.client.subscriptions.list(params)) {
        subscriptions.push(this.mapSubscription(subscription))
        if (subscriptions.length >= limit) break
      }

      return subscriptions
    } catch (error) {
      throw this.handleError(error, 'fetching subscriptions')
    }
  }

  /**
   * Get invoices, optionally filtered by customer
   */
  async getInvoices(options: {
    customerId?: string
    status?: Stripe.Invoice.Status
    limit?: number
  } = {}): Promise<StripeInvoice[]> {
    try {
      const { customerId, status, limit = 100 } = options
      const invoices: StripeInvoice[] = []

      const params: Stripe.InvoiceListParams = {
        limit: Math.min(limit, 100),
      }

      if (customerId) params.customer = customerId
      if (status) params.status = status

      for await (const invoice of this.client.invoices.list(params)) {
        invoices.push(this.mapInvoice(invoice))
        if (invoices.length >= limit) break
      }

      return invoices
    } catch (error) {
      throw this.handleError(error, 'fetching invoices')
    }
  }

  /**
   * Calculate Monthly Recurring Revenue from all active subscriptions
   */
  async calculateMRR(): Promise<number> {
    try {
      let mrr = 0

      for await (const subscription of this.client.subscriptions.list({ status: 'active' })) {
        for (const item of subscription.items.data) {
          const price = item.price
          const quantity = item.quantity || 1

          // Convert amount to dollars (Stripe uses cents)
          const amount = (price.unit_amount || 0) / 100

          // Normalize to monthly
          if (price.recurring) {
            const interval = price.recurring.interval
            const intervalCount = price.recurring.interval_count

            let monthlyAmount: number
            switch (interval) {
              case 'month':
                monthlyAmount = (amount * quantity) / intervalCount
                break
              case 'year':
                monthlyAmount = (amount * quantity) / (12 * intervalCount)
                break
              case 'week':
                monthlyAmount = (amount * quantity * 4.33) / intervalCount
                break
              case 'day':
                monthlyAmount = (amount * quantity * 30) / intervalCount
                break
              default:
                monthlyAmount = 0
            }

            mrr += monthlyAmount
          }
        }
      }

      return Math.round(mrr * 100) / 100 // Round to 2 decimal places
    } catch (error) {
      throw this.handleError(error, 'calculating MRR')
    }
  }

  /**
   * Get usage records for metered billing
   * Note: Uses raw API call as SDK method varies by version
   */
  async getUsageRecords(subscriptionItemId: string): Promise<unknown[]> {
    try {
      // Use raw API endpoint for compatibility across SDK versions
      const response = await fetch(
        `https://api.stripe.com/v1/subscription_items/${subscriptionItemId}/usage_record_summaries?limit=100`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
          },
        }
      )

      if (!response.ok) {
        throw new Error(`Stripe API error: ${response.statusText}`)
      }

      const data = await response.json()
      return data.data || []
    } catch (error) {
      throw this.handleError(error, 'fetching usage records')
    }
  }

  /**
   * Test the Stripe API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.client.accounts.retrieve()
      return true
    } catch {
      return false
    }
  }

  /**
   * Map Stripe Customer to our internal type
   */
  private mapCustomer(customer: Stripe.Customer): StripeCustomer {
    return {
      id: customer.id,
      email: customer.email ?? null,
      name: customer.name ?? null,
      metadata: customer.metadata || {},
      created: customer.created,
      subscriptions: customer.subscriptions
        ? {
            data: customer.subscriptions.data.map((s) => this.mapSubscription(s)),
          }
        : undefined,
    }
  }

  /**
   * Map Stripe Subscription to our internal type
   * Uses type assertions due to Stripe SDK version variations
   */
  private mapSubscription(subscription: Stripe.Subscription): StripeSubscription {
    const sub = subscription as unknown as {
      id: string
      customer: string
      status: string
      current_period_start: number
      current_period_end: number
      items: { data: { id: string; price: Stripe.Price; quantity?: number }[] }
      metadata: Record<string, string>
    }

    return {
      id: sub.id,
      customer: typeof sub.customer === 'string' ? sub.customer : (sub.customer as { id: string }).id,
      status: sub.status as StripeSubscription['status'],
      current_period_start: sub.current_period_start,
      current_period_end: sub.current_period_end,
      items: {
        data: sub.items.data.map((item) => ({
          id: item.id,
          price: {
            id: item.price.id,
            unit_amount: item.price.unit_amount,
            currency: item.price.currency,
            recurring: item.price.recurring
              ? {
                  interval: item.price.recurring.interval as 'day' | 'week' | 'month' | 'year',
                  interval_count: item.price.recurring.interval_count,
                }
              : null,
          },
          quantity: item.quantity || 1,
        })),
      },
      metadata: sub.metadata || {},
    }
  }

  /**
   * Map Stripe Invoice to our internal type
   */
  private mapInvoice(invoice: Stripe.Invoice): StripeInvoice {
    return {
      id: invoice.id,
      customer: invoice.customer as string,
      status: invoice.status || 'draft',
      amount_paid: invoice.amount_paid,
      amount_due: invoice.amount_due,
      created: invoice.created,
      period_start: invoice.period_start,
      period_end: invoice.period_end,
    }
  }

  /**
   * Handle Stripe errors
   */
  private handleError(error: unknown, context: string): never {
    const stripeError = error as Stripe.errors.StripeError

    const isRetryable =
      stripeError.type === 'StripeRateLimitError' ||
      stripeError.type === 'StripeAPIError'

    throw createIntegrationError(
      `Stripe error ${context}: ${stripeError.message}`,
      stripeError.code || stripeError.type,
      stripeError.statusCode,
      isRetryable
    )
  }
}

/**
 * Factory function to create a Stripe client
 */
export function createStripeClient(apiKey: string): StripeClient {
  return new StripeClient({ apiKey })
}
