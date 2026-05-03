/**
 * POST /api/onboarding/complete
 *
 * Fires `AgentService.triggerAnalysisIfNotRecentlyRun` once the workspace has
 * finished onboarding. Replaces the old gating where agent analysis only
 * kicked off after Stripe card entry — free-tier users (MTU ≤ threshold) now
 * get an agent run without linking a card.
 *
 * Also serves as the self-heal entrypoint: /memory calls this on mount so any
 * workspace stuck without a session (e.g. the Stefan / Plenty case) recovers
 * on next login.
 *
 * Idempotent: safe to call on every mount. A recent (created/running/completed)
 * session within 24h short-circuits the trigger.
 */

import { NextResponse, after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceMembership } from '@/lib/supabase/helpers';
import { computeSetupStatus } from '@/lib/setup/status';
import { AgentService } from '@/lib/agent/agent-service';
import { createModuleLogger } from '@/lib/utils/logger';

const log = createModuleLogger('[Onboarding Complete]');

// Lambda must outlive the synchronous ADK /run call (upsell → dwh → mason
// signal_agent typically takes 60–240s on first run; default 300s is too tight
// because after() needs an extra buffer for status update + cleanup). Without
// this, the function recycles before the catch path runs, leaving sessions
// stuck at status='created' even when the agent itself completed successfully.
export const maxDuration = 600;

export async function POST() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const membership = await getWorkspaceMembership();
    if (!membership) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 });
    }

    const status = await computeSetupStatus(membership.workspaceId);
    if (!status.setupComplete) {
      return NextResponse.json(
        {
          error: 'Setup is not complete',
          status,
        },
        { status: 400 }
      );
    }

    // Schedule the trigger via after() so the Vercel lambda stays alive until
    // createSession + the /run fetch complete. Without this, fire-and-forget
    // gets killed when the response returns, leaving no session row and no
    // agent run — exactly the "nothing happens after /api/onboarding/complete
    // returns 200" we saw during Fix 4 E2E testing.
    after(async () => {
      try {
        await AgentService.triggerAnalysisIfNotRecentlyRun(membership.workspaceId);
      } catch (err) {
        log.error(`Failed to trigger agent analysis for ${membership.workspaceId}: ${err}`);
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error(`Unexpected error: ${error}`);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
