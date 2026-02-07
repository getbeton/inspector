import { NextRequest, NextResponse } from 'next/server';
import { createModuleLogger } from '@/lib/utils/logger';
import { validateAgentRequest } from '@/lib/agent/auth';
import { rateLimitResponse } from '@/lib/agent/rate-limit';
import { resolveSession } from '@/lib/agent/session';
import { getIntegrationCredentialsAdmin } from '@/lib/integrations/credentials';
import { createPostHogClient } from '@/lib/integrations/posthog/client';

const log = createModuleLogger('[API][Agent][SQLProxy]');

export async function POST(req: NextRequest) {
    if (!validateAgentRequest(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { query, session_id } = body;
        let { workspace_id } = body;

        if (!query) {
            return NextResponse.json({ error: 'Missing query' }, { status: 400 });
        }

        // Support session_id-based workspace resolution (new)
        // Falls back to direct workspace_id (backward compatible)
        if (!workspace_id && session_id) {
            try {
                const session = await resolveSession(session_id);
                workspace_id = session.workspaceId;
            } catch (e) {
                const msg = e instanceof Error ? e.message : 'Invalid session';
                return NextResponse.json({ error: msg }, { status: 404 });
            }
        }

        if (!workspace_id) {
            return NextResponse.json({ error: 'Missing workspace_id or session_id' }, { status: 400 });
        }

        // Rate limit per workspace (tighter for SQL proxy)
        const limited = rateLimitResponse(workspace_id, { maxRequests: 20 });
        if (limited) return limited;

        // Use admin credentials (no cookies in agent requests)
        const credentials = await getIntegrationCredentialsAdmin(workspace_id, 'posthog');
        if (!credentials || !credentials.apiKey || !credentials.projectId) {
            return NextResponse.json({ error: 'PostHog integration not found' }, { status: 404 });
        }

        const client = createPostHogClient(
            credentials.apiKey,
            credentials.projectId,
            credentials.host || undefined
        );

        log.warn(`[AUDIT] SQL proxy query workspace=${workspace_id} query=${query.substring(0, 80)}...`);

        // Execute Query
        const result = await client.query(query);

        return NextResponse.json(result);
    } catch (e) {
        log.error(`SQL Proxy execution failed: ${e}`);
        const msg = e instanceof Error ? e.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
