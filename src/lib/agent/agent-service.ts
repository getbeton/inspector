import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createModuleLogger } from '@/lib/utils/logger';
import { createSession, updateSessionStatus } from '@/lib/agent/session';
import { isIntegrationConfiguredAdmin } from '@/lib/integrations/credentials';
import { randomUUID } from 'crypto';

const log = createModuleLogger('[AgentService]');

const DEFAULT_AGENT_API_URL = 'https://inspector-ml-backend-production.up.railway.app';
const APP_NAME = 'upsell_agent';

function getAgentApiUrl(): string {
    return process.env.AGENT_API_URL || DEFAULT_AGENT_API_URL;
}

export class AgentService {
    /**
     * Idempotent wrapper around `triggerAnalysis`.
     *
     * Skips the trigger if the workspace already has an agent session in a
     * non-failed state (`created` / `running` / `completed`) within the lookback
     * window. Failed/closed sessions are ignored so manual retries still work.
     *
     * Safe to call on every mount of the post-onboarding UI — it's the
     * self-heal entry point for workspaces that landed on /memory without an
     * active session (e.g. the free-tier onboarding path).
     */
    static async triggerAnalysisIfNotRecentlyRun(
        workspaceId: string,
        windowHours = 24
    ): Promise<void> {
        const supabase = createAdminClient();
        const cutoff = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

        const { data, error } = await supabase
            .from('workspace_agent_sessions')
            .select('session_id, status')
            .eq('workspace_id', workspaceId)
            .in('status', ['created', 'running', 'completed'])
            .gte('created_at', cutoff)
            .limit(1);

        if (error) {
            // Fail open: better to trigger twice than to block the user forever on
            // a transient DB read error. Downstream guards keep this safe.
            log.warn(`Idempotency check failed, proceeding with trigger: ${error.message}`);
        } else if (data && data.length > 0) {
            log.info(`Workspace ${workspaceId} has recent session ${data[0].session_id} (${data[0].status}); skipping trigger`);
            return;
        }

        return AgentService.triggerAnalysis(workspaceId);
    }

    /**
     * Triggers the Agent to start analysis for a workspace.
     *
     * The agent calls back to Inspector API routes (sql-proxy, list-tables, etc.)
     * which resolve credentials server-side — no secrets leave this backend.
     */
    static async triggerAnalysis(workspaceId: string) {
        log.info(`Triggering agent analysis for workspace: ${workspaceId}`);

        const supabase = await createClient();

        // 1. Get Workspace Details (Website URL)
        const { data: workspaceRaw, error: wsError } = await supabase
            .from('workspaces')
            .select('website_url, slug')
            .eq('id', workspaceId)
            .single();

        const workspace = workspaceRaw as { website_url: string | null; slug: string } | null;

        if (wsError || !workspace) {
            log.error(`Failed to fetch workspace: ${wsError?.message}`);
            throw new Error('Workspace not found');
        }

        if (!workspace.website_url) {
            log.warn(`No website_url for workspace ${workspaceId}. Agent might fail.`);
        }

        // 2. Construct Payload
        // Use workspace ID as unique user identifier for Agent session isolation
        const userId = workspaceId;
        // Use cryptographic random UUID instead of timestamp for unpredictable session IDs
        const sessionId = `s_${randomUUID()}`;

        // 3b. Persist session to DB for lifecycle tracking
        try {
            await createSession(sessionId, workspaceId);
        } catch (e) {
            log.error(`Failed to persist session ${sessionId}: ${e}`);
            // Non-blocking: continue even if DB write fails
        }

        // Check which integrations are available for this workspace
        const firecrawlConfigured = await isIntegrationConfiguredAdmin(workspaceId, 'firecrawl');

        const promptText = `Analyze website: '${workspace.website_url}'. Use the Inspector callback URL to query PostHog data via proxy routes. Your session ID for Inspector callbacks is: ${sessionId}. Your workspace ID is: ${workspaceId}. Return JSON only.`;

        // 4. Create User/Session on Agent
        try {
            const sessionUrl = `${getAgentApiUrl()}/apps/${APP_NAME}/users/${userId}/sessions/${sessionId}`;
            const sessionRes = await fetch(sessionUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ created_by: 'inspector_mvp' })
            });

            // If session-create fails (e.g. ml-backend redeploy broke the app path),
            // surface it in workspace_agent_sessions.error_message instead of
            // silently proceeding to /run which would also fail without a clear trace.
            if (!sessionRes.ok) {
                const body = await sessionRes.text().catch(() => '<no body>');
                const msg = `Agent session create failed: ${sessionRes.status} ${body.slice(0, 500)}`;
                log.error(msg);
                updateSessionStatus(sessionId, 'failed', msg).catch(() => {});
                return;
            }

            // 5. Run Agent — no credentials sent; agent uses callback routes
            const runUrl = `${getAgentApiUrl()}/run`;
            const runPayload = {
                appName: APP_NAME,
                userId: userId,
                sessionId: sessionId,
                context: {
                    workspace_id: workspaceId,
                    session_id: sessionId,
                    inspector_callback_url: process.env.NEXT_PUBLIC_VERCEL_URL
                        ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
                        : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
                    capabilities: {
                        fetch_url: firecrawlConfigured,
                    },
                },
                newMessage: {
                    role: 'user',
                    parts: [{ text: promptText }]
                }
            };

            log.info(`Agent run triggered for ${userId}/${sessionId}`);

            // Schedule the /run POST + status transition via `after()` so the Vercel
            // lambda waits for it to complete before recycling. Without this, plain
            // fire-and-forget promises can be killed mid-flight — leaving sessions
            // stuck in `created` because `updateSessionStatus(..., 'running')` never runs.
            // Agent execution on the ml-backend remains async: `/run` returns quickly
            // after accepting the job, so `after()` only waits for that acceptance RTT.
            after(async () => {
                try {
                    const res = await fetch(runUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(runPayload),
                    });
                    if (!res.ok) {
                        const text = await res.text().catch(() => '<no body>');
                        log.error(`Agent run failed: ${res.status} ${text}`);
                        await updateSessionStatus(sessionId, 'failed', `Agent run failed: ${res.status}`).catch(() => {});
                    } else {
                        log.info(`Agent run initiated successfully for workspace ${workspaceId}`);
                        await updateSessionStatus(sessionId, 'running').catch(() => {});
                    }
                } catch (err) {
                    log.error(`Agent trigger error: ${err}`);
                    await updateSessionStatus(sessionId, 'failed', String(err)).catch(() => {});
                }
            });

        } catch (e) {
            log.error(`Failed to communicate with Agent: ${e}`);
            // Don't block the user flow — billing setup should succeed even if agent is down
        }
    }
}
