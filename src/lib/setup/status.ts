/**
 * Compute the setup-completion status for a workspace.
 *
 * Single source of truth for "is onboarding done?" — used by:
 * - GET /api/workspace/setup-status (UI polling)
 * - POST /api/onboarding/complete (agent-trigger gate)
 *
 * Billing rule (Vlad, 2026-04-23): free-tier workspaces (MTU ≤ threshold) finish
 * onboarding without a card; above-threshold workspaces must have an active
 * subscription.
 */

import { createClient } from '@/lib/supabase/server';
import { isBillingEnabled, getMtuLimit } from '@/lib/utils/deployment';
import { calculateMTU } from '@/lib/billing/mtu-service';
import type { IntegrationConfig } from '@/lib/supabase/types';

export interface SetupStatus {
  setupComplete: boolean;
  integrations: {
    posthog: boolean;
    attio: boolean;
    hubspot: boolean;
  };
  billing: {
    required: boolean;
    configured: boolean;
    status: string | null;
  };
  workspaceId: string;
}

interface WorkspaceBillingRow {
  status: string | null;
  free_tier_mtu_limit: number | null;
}

export async function computeSetupStatus(workspaceId: string): Promise<SetupStatus> {
  const supabase = await createClient();

  const { data: integrationData } = await supabase
    .from('integration_configs')
    .select('integration_name, status, is_active')
    .eq('workspace_id', workspaceId);

  const integrations = integrationData as Pick<
    IntegrationConfig,
    'integration_name' | 'status' | 'is_active'
  >[] | null;

  const posthogConfig = integrations?.find((i) => i.integration_name === 'posthog');
  const attioConfig = integrations?.find((i) => i.integration_name === 'attio');
  const hubspotConfig = integrations?.find((i) => i.integration_name === 'hubspot');

  const posthogConnected = !!(posthogConfig?.is_active && posthogConfig?.status === 'connected');
  const attioConnected = !!(attioConfig?.is_active && attioConfig?.status === 'connected');
  // HubSpot is an optional destination — surfaced for UI gating only; it does
  // NOT factor into setupComplete (still posthog + attio).
  const hubspotConnected = !!(hubspotConfig?.is_active && hubspotConfig?.status === 'connected');

  const billingRequired = isBillingEnabled();
  let billingConfigured = false;
  let billingStatus: string | null = null;

  if (billingRequired) {
    const { data: billingData } = await supabase
      .from('workspace_billing')
      .select('status, free_tier_mtu_limit')
      .eq('workspace_id', workspaceId)
      .single();

    const billing = billingData as WorkspaceBillingRow | null;
    billingStatus = billing?.status ?? null;

    if (billing?.status === 'active') {
      billingConfigured = true;
    } else if (billing?.status !== 'card_required') {
      // Either no billing row (free-tier user never hit /api/billing/setup-intent)
      // or status === 'free'. Treat as configured iff MTU is below the free-tier
      // threshold. Above-threshold users must enter a card to advance.
      const mtuLimit = getMtuLimit(billing?.free_tier_mtu_limit ?? undefined);
      let currentMtu = 0;
      if (posthogConnected) {
        try {
          const mtuResult = await calculateMTU(workspaceId);
          currentMtu = mtuResult?.mtuCount ?? 0;
        } catch {
          // Be pessimistic on lookup failure: block until MTU can be verified.
          currentMtu = Number.POSITIVE_INFINITY;
        }
      }
      billingConfigured = currentMtu <= mtuLimit;
    }
    // status === 'card_required' → billingConfigured stays false
  }

  const setupComplete =
    posthogConnected && attioConnected && (!billingRequired || billingConfigured);

  return {
    setupComplete,
    integrations: {
      posthog: posthogConnected,
      attio: attioConnected,
      hubspot: hubspotConnected,
    },
    billing: {
      required: billingRequired,
      configured: billingConfigured,
      status: billingStatus,
    },
    workspaceId,
  };
}
