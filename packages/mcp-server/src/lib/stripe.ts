/**
 * Stripe utilities for MCP billing tools
 */

import Stripe from 'stripe'

let stripeInstance: Stripe | null = null

function getStripe(): Stripe {
  if (!stripeInstance) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY environment variable is required')
    }
    stripeInstance = new Stripe(key)
  }
  return stripeInstance
}

/**
 * Create a Stripe Checkout Session for card entry.
 * Returns the checkout URL.
 */
export async function createCheckoutSession(options: {
  workspaceId: string
  workspaceName: string
  stripeCustomerId: string | null
  successUrl: string
  cancelUrl: string
}): Promise<{ url: string }> {
  const stripe = getStripe()

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: 'setup',
    payment_method_types: ['card'],
    success_url: options.successUrl,
    cancel_url: options.cancelUrl,
    metadata: {
      workspace_id: options.workspaceId,
    },
  }

  if (options.stripeCustomerId) {
    sessionParams.customer = options.stripeCustomerId
  } else {
    sessionParams.customer_creation = 'always'
    sessionParams.customer_email = undefined
  }

  const session = await stripe.checkout.sessions.create(sessionParams)

  if (!session.url) {
    throw new Error('Stripe did not return a checkout URL')
  }

  return { url: session.url }
}
