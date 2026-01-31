import { NextRequest, NextResponse } from 'next/server';
import { createModuleLogger } from '@/lib/utils/logger';
import { validateAgentRequest } from '@/lib/agent/auth';
import { getIntegrationCredentials } from '@/lib/integrations/credentials';
import { createPostHogClient } from '@/lib/integrations/posthog/client';

const log = createModuleLogger('[API][Agent][SQLProxy]');

export async function POST(req: NextRequest) {
    if (!validateAgentRequest(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { workspace_id, query } = body;

        if (!workspace_id || !query) {
            return NextResponse.json({ error: 'Missing workspace_id or query' }, { status: 400 });
        }

        // Get PostHog Creds
        const credentials = await getIntegrationCredentials(workspace_id, 'posthog');
        if (!credentials || !credentials.apiKey || !credentials.projectId) {
            return NextResponse.json({ error: 'PostHog integration not found' }, { status: 404 });
        }

        const client = createPostHogClient(
            credentials.apiKey,
            credentials.projectId,
            credentials.host || undefined
        );

        log.info(`Executing Proxy Query for ${workspace_id}: ${query.substring(0, 50)}...`);

        // Execute Query
        const result = await client.query(query);

        return NextResponse.json(result);
    } catch (e) {
        log.error(`SQL Proxy execution failed: ${e}`);
        const msg = e instanceof Error ? e.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
