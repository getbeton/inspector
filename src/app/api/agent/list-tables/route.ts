import { NextRequest, NextResponse } from 'next/server';
import { createModuleLogger } from '@/lib/utils/logger';
import { validateAgentRequest } from '@/lib/agent/auth';
import { rateLimitResponse } from '@/lib/agent/rate-limit';
import { resolveSession } from '@/lib/agent/session';
import { getIntegrationCredentialsAdmin } from '@/lib/integrations/credentials';
import { createPostHogClient } from '@/lib/integrations/posthog/client';
import type { TableInfo } from '@/lib/agent/types';

const log = createModuleLogger('[API][Agent][ListTables]');

/** Schema table types that are not directly queryable */
const NON_QUERYABLE_TYPES = new Set(['lazy_table', 'virtual_table', 'field_traverser']);

/**
 * Recursively strip null/undefined values from an object to minimize token consumption.
 */
function stripNulls<T>(obj: T): T {
    if (obj === null || obj === undefined) return undefined as unknown as T;
    if (Array.isArray(obj)) return obj.map(stripNulls) as unknown as T;
    if (typeof obj === 'object') {
        const cleaned: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
            if (v !== null && v !== undefined) {
                cleaned[k] = stripNulls(v);
            }
        }
        return cleaned as T;
    }
    return obj;
}

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

        // Fetch both sources in parallel
        const [warehouseTables, schema] = await Promise.all([
            client.getWarehouseTables().catch((e) => {
                log.warn(`Warehouse tables fetch failed: ${e}`);
                return [];
            }),
            client.getDatabaseSchema().catch((e) => {
                log.warn(`Database schema fetch failed: ${e}`);
                return {} as Record<string, never>;
            }),
        ]);

        // Build merged table map: schema provides the base, warehouse overlays
        const tableMap = new Map<string, TableInfo>();

        // 1. Schema tables (native PostHog tables: events, persons, groups, etc.)
        for (const [name, entry] of Object.entries(schema)) {
            if (NON_QUERYABLE_TYPES.has(entry.type)) continue;
            tableMap.set(name, { table_name: name, source_type: 'posthog' });
        }

        // 2. Warehouse tables overlay with richer source_type metadata
        for (const wt of warehouseTables) {
            const sourceType = wt.external_data_source?.source_type ?? null;
            tableMap.set(wt.name, {
                table_name: wt.name,
                source_type: sourceType,
            });
        }

        // Sort alphabetically and strip nulls
        const tables = Array.from(tableMap.values())
            .sort((a, b) => a.table_name.localeCompare(b.table_name))
            .map(stripNulls);

        log.info(`Listed ${tables.length} tables for workspace=${workspaceId} session=${sessionId}`);
        return NextResponse.json({ tables });
    } catch (e) {
        log.error(`List tables failed: ${e}`);
        const msg = e instanceof Error ? e.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
