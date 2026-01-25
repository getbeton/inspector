/**
 * GET /api/workspace/setup-status
 *
 * Returns the current workspace's setup completion status.
 * Used by the dashboard to determine whether to show the setup wizard
 * or redirect to the signals page.
 *
 * Response:
 * {
 *   "setupComplete": boolean,
 *   "integrations": {
 *     "posthog": boolean,
 *     "attio": boolean
 *   },
 *   "billing": {
 *     "required": boolean,
 *     "configured": boolean,
 *     "status": "active" | "card_required" | "free" | null
 *   }
 * }
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceMembership } from '@/lib/supabase/helpers'
import { isBillingEnabled } from '@/lib/utils/deployment'
import type { IntegrationConfig, Json } from '@/lib/supabase/types'

interface WorkspaceBilling {
  status: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
}

export async function GET() {
  try {
    const supabase = await createClient()

    // Authenticate user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Get workspace
    const membership = await getWorkspaceMembership()
    if (!membership) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    // Check integrations status
    const { data: integrationData } = await supabase
      .from('integration_configs')
      .select('integration_name, status, is_active')
      .eq('workspace_id', membership.workspaceId)

    const integrations = integrationData as Pick<IntegrationConfig, 'integration_name' | 'status' | 'is_active'>[] | null

    const posthogConfig = integrations?.find((i) => i.integration_name === 'posthog')
    const attioConfig = integrations?.find((i) => i.integration_name === 'attio')

    const posthogConnected = posthogConfig?.is_active && posthogConfig?.status === 'connected'
    const attioConnected = attioConfig?.is_active && attioConfig?.status === 'connected'

    // Check billing status (only in cloud mode)
    const billingRequired = isBillingEnabled()
    let billingConfigured = false
    let billingStatus: string | null = null

    if (billingRequired) {
      const { data: billingData } = await supabase
        .from('workspace_billing')
        .select('status, stripe_customer_id, stripe_subscription_id')
        .eq('workspace_id', membership.workspaceId)
        .single()

      const billing = billingData as WorkspaceBilling | null

      if (billing) {
        billingStatus = billing.status
        // Billing is configured if there's an active subscription or at least a payment method linked
        billingConfigured = billing.status === 'active' ||
                          (billing.stripe_customer_id !== null && billing.status !== 'card_required')
      }
    }

    // Setup is complete when:
    // 1. PostHog is connected
    // 2. Attio is connected
    // 3. Billing is either not required (self-hosted) or is configured (cloud)
    const setupComplete =
      posthogConnected &&
      attioConnected &&
      (!billingRequired || billingConfigured)

    return NextResponse.json({
      setupComplete,
      integrations: {
        posthog: !!posthogConnected,
        attio: !!attioConnected,
      },
      billing: {
        required: billingRequired,
        configured: billingConfigured,
        status: billingStatus,
      },
    })
  } catch (error) {
    console.error('Error in GET /api/workspace/setup-status:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
