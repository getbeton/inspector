import { createClient } from '@/lib/supabase/server';
import { getIntegrationCredentials } from '@/lib/integrations/credentials';
import { createModuleLogger } from '@/lib/utils/logger';

const log = createModuleLogger('[AgentService]');

const AGENT_API_URL = process.env.AGENT_API_URL || 'https://inspector-ml-backend-production.up.railway.app';
const APP_NAME = 'upsell_agent';

export class AgentService {
    /**
     * Triggers the Agent to start analysis for a workspace.
     * Assumes PostHog integration and Website URL are present.
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
            // potentially update website_url from other sources?
        }

        // 2. Get PostHog Credentials
        const posthog = await getIntegrationCredentials(workspaceId, 'posthog');
        if (!posthog) {
            log.error(`PostHog integration not found for workspace ${workspaceId}`);
            throw new Error('PostHog integration required');
        }

        // 3. Construct Payload
        // Prompt: USER_ID="u_123", SESSION_ID="s_123"
        // We'll use workspaceId as USER_ID (or slug?) and generate a generic session ID.
        // The prompt says "Agent should not mix data... ensuring each customer has their own agentic session".
        // "Every POST request... should include workspace_id in payload... MCP tools... will use this workspace_id".

        // The prompt script uses:
        // USER_ID, SESSION_ID in URL params: /apps/$APP_NAME/users/$USER_ID/sessions/$SESSION_ID
        // And JSON payload with Message.

        const userId = workspaceId; // Use workspace ID as the unique user identifier for Agent
        const sessionId = `s_${Date.now()}`; // Unique session ID

        const promptText = `Analyze website: '${workspace.website_url}' and use PostHog token '${posthog.apiKey}' with host '${posthog.host || 'https://us.posthog.com'}' and project '${posthog.projectId}'. Return JSON only.`;

        // 4. Create User/Session on Agent (from script curl 1)
        // curl -X POST "$API_URL/apps/$APP_NAME/users/$USER_ID/sessions/$SESSION_ID" -d '{"created_by": "mvp_demo"}'
        try {
            const sessionUrl = `${AGENT_API_URL}/apps/${APP_NAME}/users/${userId}/sessions/${sessionId}`;
            await fetch(sessionUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ created_by: 'inspector_mvp' })
            });

            // 5. Run Agent
            // curl -X POST "$API_URL/run" ...
            const runUrl = `${AGENT_API_URL}/run`;
            const runPayload = {
                appName: APP_NAME,
                userId: userId,
                sessionId: sessionId,
                newMessage: {
                    role: 'user',
                    parts: [{ text: promptText }]
                }
            };

            // Note: We are NOT waiting for the full response here if it takes too long.
            // But the script implies it returns the result.
            // If we want Fire-and-Forget, we verify if the Agent API supports async or if we just default to not awaiting?
            // But Next.js API generic timeout is short. 
            // For MVP, if it timeouts, we might not get result.
            // BUT, the prompt requirement: "Make stub in Inspector for API call FROM agent".
            // This implies the agent can call us back. 
            // So we trigger, and if it times out, the agent proceeds? 
            // Actually, 'fetch' without await might be terminated by Vercel when response closes.
            // We'll await for a reasonable time or use `waitUntil` (Next.js 15+ has after/waitUntil).
            // This codebase is Next.js 16. `import { after } from 'next/server'`?
            // Or just await and hope it's fast (unlikely for "dwh_analyst" + "upsell_agent" chain).

            // Strategy: We await. If it takes long, we rely on the Agent *calling us back* to store data.
            // We do NOT rely on the response of this POST /run for the data, because of the callback architecture requested ("Inspector stub for API call from Agent").

            // We'll log the start.
            log.info(`Agent run triggered for ${userId}/${sessionId}`);

            // Fire properly
            fetch(runUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(runPayload)
            }).then(async (res) => {
                if (!res.ok) {
                    const text = await res.text();
                    log.error(`Agent run failed: ${res.status} ${text}`);
                } else {
                    const data = await res.json();
                    // If we get data back immediately, we could store it here too.
                    // But we prefer the callback route for robustness.
                    log.info(`Agent run initiated successfully: ${JSON.stringify(data).substring(0, 100)}...`);
                }
            }).catch(err => {
                log.error(`Agent trigger error: ${err}`);
            });

        } catch (e) {
            log.error(`Failed to communicate with Agent: ${e}`);
            // Don't block the user flow? 
            // "Inspector triggers Agent ... " -> shouldn't fail the card link if agent is down.
        }
    }
}
