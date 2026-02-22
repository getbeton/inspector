/**
 * PostHog Warehouse tools (2 tools)
 *
 * - list_warehouse_tables: Available tables in PostHog data warehouse
 * - get_table_columns: Table schema with column metadata & sample values
 */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ToolContext } from '../context/types.js'
import { toMcpError } from '../lib/errors.js'
import { createWorkspacePostHogClient } from '../lib/posthog.js'

export function registerWarehouseTools(
  server: McpServer,
  getContext: () => Promise<ToolContext>
): void {
  // ── list_warehouse_tables ──────────────────────────────────────────
  server.tool(
    'list_warehouse_tables',
    'List all tables available in the PostHog data warehouse (native + external sources)',
    {},
    async () => {
      try {
        const { supabase, workspaceId } = await getContext()
        const client = await createWorkspacePostHogClient(supabase, workspaceId)

        const tables = await client.getWarehouseTables()

        // Return simplified table list
        const simplified = tables.map(t => ({
          id: t.id,
          name: t.name,
          format: t.format,
          column_count: t.columns.length,
          source: t.external_data_source?.source_type || 'native',
        }))

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ tables: simplified, total: simplified.length }, null, 2),
          }],
        }
      } catch (error) {
        return toMcpError(error)
      }
    }
  )

  // ── get_table_columns ──────────────────────────────────────────────
  server.tool(
    'get_table_columns',
    'Get the schema (columns with types) for a specific warehouse table',
    {
      table_name: z.string().describe('The table name to inspect'),
    },
    async ({ table_name }) => {
      try {
        const { supabase, workspaceId } = await getContext()
        const client = await createWorkspacePostHogClient(supabase, workspaceId)

        const schema = await client.getDatabaseSchema()
        const table = schema[table_name]

        if (!table) {
          return toMcpError(new Error(`Table "${table_name}" not found. Use list_warehouse_tables to see available tables.`))
        }

        const columns = Object.entries(table.fields).map(([key, field]) => ({
          name: key,
          type: field.type,
          table: field.table,
          schema_valid: field.schema_valid,
        }))

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              table_name,
              table_type: table.type,
              columns,
              column_count: columns.length,
            }, null, 2),
          }],
        }
      } catch (error) {
        return toMcpError(error)
      }
    }
  )
}
