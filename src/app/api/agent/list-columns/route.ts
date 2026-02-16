import { NextRequest, NextResponse } from 'next/server';
import { createModuleLogger } from '@/lib/utils/logger';
import { validateAgentRequest } from '@/lib/agent/auth';
import { rateLimitResponse } from '@/lib/agent/rate-limit';
import { resolveSession } from '@/lib/agent/session';
import { getIntegrationCredentialsAdmin } from '@/lib/integrations/credentials';
import { createPostHogClient } from '@/lib/integrations/posthog/client';
import type { WarehouseTable, DatabaseSchemaResponse } from '@/lib/integrations/posthog/client';
import type { ColumnInfo, TableColumnsResponse } from '@/lib/agent/types';

const log = createModuleLogger('[API][Agent][ListColumns]');

/** Schema table types that are not directly queryable */
const NON_QUERYABLE_TYPES = new Set(['lazy_table', 'virtual_table', 'field_traverser']);

/** Max number of non-null sample values per column */
const MAX_SAMPLES = 3;
/** Number of rows to fetch for sampling */
const SAMPLE_ROWS = 30;

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

/**
 * Build column metadata from warehouse table or database schema.
 */
function getColumnsFromSources(
    tableName: string,
    warehouseMap: Map<string, WarehouseTable>,
    schema: DatabaseSchemaResponse
): { columns: { name: string; type: string }[]; sourceType: string | null } {
    // Prefer warehouse table (richer metadata)
    const wt = warehouseMap.get(tableName);
    if (wt) {
        const sourceType = wt.external_data_source?.source_type ?? null;
        const columns = wt.columns.map((c) => ({ name: c.key, type: c.type }));
        return { columns, sourceType };
    }

    // Fallback to schema (filter out non-queryable field types like lazy_table, virtual_table)
    const schemaEntry = schema[tableName];
    if (schemaEntry) {
        const columns = Object.entries(schemaEntry.fields)
            .filter(([, field]) => !NON_QUERYABLE_TYPES.has(field.type))
            .map(([key, field]) => ({
                name: key,
                type: field.type,
            }));
        return { columns, sourceType: 'posthog' };
    }

    return { columns: [], sourceType: null };
}

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

        // Fetch both sources for allowlist validation + column metadata
        const [warehouseTables, schema] = await Promise.all([
            client.getWarehouseTables().catch((e) => {
                log.warn(`Warehouse tables fetch failed: ${e}`);
                return [] as WarehouseTable[];
            }),
            client.getDatabaseSchema().catch((e) => {
                log.warn(`Database schema fetch failed: ${e}`);
                return {} as DatabaseSchemaResponse;
            }),
        ]);

        // Build warehouse lookup map
        const warehouseMap = new Map<string, WarehouseTable>();
        for (const wt of warehouseTables) {
            warehouseMap.set(wt.name, wt);
        }

        // Allowlist validation: verify table exists in known sources
        const inWarehouse = warehouseMap.has(tableId);
        const inSchema = tableId in schema && !NON_QUERYABLE_TYPES.has(schema[tableId].type);
        if (!inWarehouse && !inSchema) {
            return NextResponse.json(
                { error: `Table '${tableId}' not found in PostHog` },
                { status: 404 }
            );
        }

        // Get column metadata from the appropriate source
        const { columns: rawColumns, sourceType } = getColumnsFromSources(tableId, warehouseMap, schema);

        // Sample non-empty values via HogQL (one query for all columns)
        let sampleRows: unknown[][] = [];
        let sampleColumnNames: string[] = [];
        try {
            const sampleResult = await client.query(
                `SELECT * FROM ${tableId} LIMIT ${SAMPLE_ROWS}`
            );
            sampleRows = sampleResult.results;
            sampleColumnNames = sampleResult.columns;
        } catch (e) {
            // Non-fatal: some tables may not be directly queryable via HogQL
            log.warn(`Could not sample ${tableId}: ${e}`);
        }

        // Build column index for fast lookup
        const colIndexMap = new Map<string, number>();
        for (let i = 0; i < sampleColumnNames.length; i++) {
            colIndexMap.set(sampleColumnNames[i], i);
        }

        // Build final column info with samples
        const columns: ColumnInfo[] = rawColumns.map((col) => {
            const colIdx = colIndexMap.get(col.name);
            const samples: unknown[] = [];

            if (colIdx !== undefined) {
                for (const row of sampleRows) {
                    if (samples.length >= MAX_SAMPLES) break;
                    const val = row[colIdx];
                    if (val !== null && val !== undefined && val !== '') {
                        samples.push(val);
                    }
                }
            }

            return { name: col.name, type: col.type, samples };
        });

        const response: TableColumnsResponse = {
            table_name: tableId,
            queryable_name: tableId,
            source_type: sourceType,
            columns,
        };

        log.info(`Listed ${columns.length} columns for table=${tableId} workspace=${workspaceId}`);
        return NextResponse.json(stripNulls(response));
    } catch (e) {
        log.error(`List columns failed: ${e}`);
        const msg = e instanceof Error ? e.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
