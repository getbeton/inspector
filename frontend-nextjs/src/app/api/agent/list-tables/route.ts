import { NextRequest, NextResponse } from 'next/server';
import { createModuleLogger } from '@/lib/utils/logger';
import { validateAgentRequest } from '@/lib/agent/auth';
import { rateLimitResponse } from '@/lib/agent/rate-limit';
import { resolveSession } from '@/lib/agent/session';
import { getIntegrationCredentialsAdmin } from '@/lib/integrations/credentials';
import { createPostHogClient } from '@/lib/integrations/posthog/client';
import type { TableInfo } from '@/lib/agent/types';

const log = createModuleLogger('[API][Agent][ListTables]');

const TABLE_ID_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export async function GET(req: NextRequest) {
    if (!validateAgentRequest(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(req.url);
        const sessionId = searchParams.get('session_id');

        if (!sessionId) {
            return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
        }

        // Resolve session → workspace
        let workspaceId: string;
        try {
            const session = await resolveSession(sessionId);
            workspaceId = session.workspaceId;
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Invalid session';
            return NextResponse.json({ error: msg }, { status: 404 });
        }

        // Rate limit per workspace
        const limited = rateLimitResponse(workspaceId);
        if (limited) return limited;

        // Get PostHog credentials via admin client (no cookies)
        const credentials = await getIntegrationCredentialsAdmin(workspaceId, 'posthog');
        if (!credentials || !credentials.apiKey || !credentials.projectId) {
            return NextResponse.json({ error: 'PostHog integration not found' }, { status: 404 });
        }

        const client = createPostHogClient(
            credentials.apiKey,
            credentials.projectId,
            credentials.host || undefined
        );

        // Query system.tables via HogQL
        const hogql = `SELECT name, engine, total_rows, total_bytes FROM system.tables WHERE database = currentDatabase() ORDER BY name`;
        const result = await client.query(hogql);

        const tables: TableInfo[] = result.results.map((row) => {
            const name = String(row[0]);
            return {
                table_id: TABLE_ID_REGEX.test(name) ? name : '',
                table_name: name,
                engine: String(row[1]),
                total_rows: Number(row[2]) || 0,
                total_bytes: Number(row[3]) || 0,
            };
        }).filter(t => t.table_id !== '');

        log.info(`Listed ${tables.length} tables for workspace=${workspaceId} session=${sessionId}`);
        return NextResponse.json({ tables });
    } catch (e) {
        log.error(`List tables failed: ${e}`);
        const msg = e instanceof Error ? e.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
