import { createClient } from '@/lib/supabase/server';
import { createModuleLogger } from '@/lib/utils/logger';
import { createSession, updateSessionStatus } from '@/lib/agent/session';
import { randomUUID } from 'crypto';

const log = createModuleLogger('[AgentService]');

const DEFAULT_AGENT_API_URL = 'https://inspector-ml-backend-production.up.railway.app';
const APP_NAME = 'upsell_agent';

function getAgentApiUrl(): string {
    return process.env.AGENT_API_URL || DEFAULT_AGENT_API_URL;
}

export class AgentService {
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

        const promptText = `Analyze website: '${workspace.website_url}'. Use the Inspector callback URL to query PostHog data via proxy routes. Return JSON only.`;

        // 4. Create User/Session on Agent
        try {
            const sessionUrl = `${getAgentApiUrl()}/apps/${APP_NAME}/users/${userId}/sessions/${sessionId}`;
            await fetch(sessionUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ created_by: 'inspector_mvp' })
            });

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
                },
                newMessage: {
                    role: 'user',
                    parts: [{ text: promptText }]
                }
            };

            log.info(`Agent run triggered for ${userId}/${sessionId}`);

            // Fire-and-forget: Agent calls back to /api/agent/data/* to store results
            fetch(runUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(runPayload)
            }).then(async (res) => {
                if (!res.ok) {
                    const text = await res.text();
                    log.error(`Agent run failed: ${res.status} ${text}`);
                    updateSessionStatus(sessionId, 'failed', `Agent run failed: ${res.status}`).catch(() => {});
                } else {
                    log.info(`Agent run initiated successfully for workspace ${workspaceId}`);
                    updateSessionStatus(sessionId, 'running').catch(() => {});
                }
            }).catch(err => {
                log.error(`Agent trigger error: ${err}`);
                updateSessionStatus(sessionId, 'failed', String(err)).catch(() => {});
            });

        } catch (e) {
            log.error(`Failed to communicate with Agent: ${e}`);
            // Don't block the user flow — billing setup should succeed even if agent is down
        }
    }
}
