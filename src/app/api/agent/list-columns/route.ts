import { NextRequest, NextResponse } from 'next/server';
import { createModuleLogger } from '@/lib/utils/logger';
import { validateAgentRequest } from '@/lib/agent/auth';
import { rateLimitResponse } from '@/lib/agent/rate-limit';
import { resolveSession } from '@/lib/agent/session';
import { getIntegrationCredentialsAdmin } from '@/lib/integrations/credentials';
import { createPostHogClient } from '@/lib/integrations/posthog/client';
import type { ColumnInfo, TableColumnsResponse } from '@/lib/agent/types';

const log = createModuleLogger('[API][Agent][ListColumns]');

/** Strict identifier regex to prevent SQL injection in table name interpolation */
const TABLE_ID_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export async function GET(req: NextRequest) {
    if (!validateAgentRequest(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(req.url);
        const sessionId = searchParams.get('session_id');
        const tableId = searchParams.get('table_id');

        if (!sessionId || !tableId) {
            return NextResponse.json({ error: 'Missing session_id or table_id' }, { status: 400 });
        }

        // Validate table_id against strict regex to prevent injection
        if (!TABLE_ID_REGEX.test(tableId)) {
            return NextResponse.json({ error: 'Invalid table_id format' }, { status: 400 });
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

        // Get PostHog credentials via admin client
        const credentials = await getIntegrationCredentialsAdmin(workspaceId, 'posthog');
        if (!credentials || !credentials.apiKey || !credentials.projectId) {
            return NextResponse.json({ error: 'PostHog integration not found' }, { status: 404 });
        }

        const client = createPostHogClient(
            credentials.apiKey,
            credentials.projectId,
            credentials.host || undefined
        );

        // Fetch virtual schema and look up the requested table
        const schema = await client.getDatabaseSchema();
        const schemaTable = schema.tables[tableId];

        if (!schemaTable) {
            return NextResponse.json({ error: `Table '${tableId}' not found in schema` }, { status: 404 });
        }

        // Field types that are structural/internal and not directly queryable
        const NON_QUERYABLE_FIELD_TYPES = new Set(['lazy_table', 'virtual_table', 'field_traverser']);

        // Extract queryable fields from schema
        const schemaFields = Object.values(schemaTable.fields)
            .filter(f => !NON_QUERYABLE_FIELD_TYPES.has(f.type));

        // Sample rows for example values (this works via HogQL on Cloud)
        const sampleQuery = `SELECT * FROM ${tableId} LIMIT 3`;
        let sampleRows: unknown[][] = [];
        let sampleColumns: string[] = [];
        try {
            const sampleResult = await client.query(sampleQuery);
            sampleRows = sampleResult.results;
            sampleColumns = sampleResult.columns;
        } catch (e) {
            // Non-fatal: some tables may not be directly queryable
            log.warn(`Could not sample ${tableId}: ${e}`);
        }

        // Build column info with example values
        const columns: ColumnInfo[] = schemaFields.map((field) => {
            const colIndex = sampleColumns.indexOf(field.name);
            const examples = colIndex >= 0
                ? sampleRows.map(sampleRow => sampleRow[colIndex])
                : [];

            return {
                col_id: field.name,
                col_name: field.name,
                col_type: field.type,
                examples,
            };
        });

        const response: TableColumnsResponse = { table_id: tableId, columns };

        log.info(`Listed ${columns.length} columns for table=${tableId} workspace=${workspaceId}`);
        return NextResponse.json(response);
    } catch (e) {
        log.error(`List columns failed: ${e}`);
        const msg = e instanceof Error ? e.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
