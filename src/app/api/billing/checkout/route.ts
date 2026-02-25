/**
 * POST /api/billing/checkout
 *
 * Create a Stripe Checkout session for entering payment details.
 * Returns a URL the user should open in their browser.
 *
 * Security fixes:
 * - H4: Validate success_url and cancel_url against allowed hosts
 * - M11: Role enforcement (admin/owner only)
 */

import { NextRequest, NextResponse } from 'next/server'
import { withRLSContext, withErrorHandler, type RLSContext } from '@/lib/middleware'
import { isBillingEnabled } from '@/lib/utils/deployment'
import {
  createCheckoutSession,
  StripeBillingDisabledError,
} from '@/lib/integrations/stripe/billing'

interface CheckoutRequest {
  success_url: string
  cancel_url: string
}

/**
 * Validate that a URL's host is in the allowed list.
 * Prevents arbitrary URL injection into Stripe checkout sessions.
 */
function isAllowedCheckoutUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    const allowedHosts = new Set(['localhost'])

    if (appUrl) {
      try {
        allowedHosts.add(new URL(appUrl).hostname)
      } catch { /* ignore invalid APP_URL */ }
    }

    // Allow *.vercel.app for preview deployments
    if (url.hostname.endsWith('.vercel.app')) return true
    if (allowedHosts.has(url.hostname)) return true

    return false
  } catch {
    return false
  }
}

async function handleCreateCheckout(
  request: NextRequest,
  context: RLSContext
): Promise<NextResponse> {
  // M11 fix: Role enforcement on billing operations
  if (!['admin', 'owner'].includes(context.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  if (!isBillingEnabled()) {
    return NextResponse.json(
      { error: 'Billing is disabled in self-hosted mode' },
      { status: 400 }
    )
  }

  const { supabase, workspaceId } = context

  let body: CheckoutRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.success_url || !body.cancel_url) {
    return NextResponse.json(
      { error: 'success_url and cancel_url are required' },
      { status: 400 }
    )
  }

  // H4 fix: Validate checkout URLs against allowed hosts
  if (!isAllowedCheckoutUrl(body.success_url) || !isAllowedCheckoutUrl(body.cancel_url)) {
    return NextResponse.json(
      { error: 'success_url and cancel_url must point to allowed domains' },
      { status: 400 }
    )
  }

  try {
    // Get workspace details for Stripe
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('name')
      .eq('id', workspaceId)
      .single()

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }

    // Check for existing Stripe customer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: billing } = await (supabase as any)
      .from('workspace_billing')
      .select('stripe_customer_id')
      .eq('workspace_id', workspaceId)
      .single()

    const stripeCustomerId = (billing as { stripe_customer_id: string | null } | null)?.stripe_customer_id ?? undefined

    const result = await createCheckoutSession({
      workspaceId,
      workspaceName: workspace.name,
      stripeCustomerId,
      successUrl: body.success_url,
      cancelUrl: body.cancel_url,
    })

    return NextResponse.json({ checkout_url: result.url })
  } catch (error) {
    if (error instanceof StripeBillingDisabledError) {
      return NextResponse.json({ error: 'Billing is not configured' }, { status: 400 })
    }

    console.error('[Checkout] Unexpected error:', error)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}

export const POST = withErrorHandler(withRLSContext(handleCreateCheckout))
