/**
 * Joins tool (1 tool)
 *
 * - get_confirmed_joins: Confirmed table relationships from agent sessions
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AdminToolContext } from '../context/types.js'
import { toMcpError } from '../lib/errors.js'
import type { Json } from '../lib/copied/supabase-types.js'

export function registerJoinsTools(
  server: McpServer,
  getAdminContext: () => Promise<AdminToolContext>
): void {
  server.tool(
    'get_confirmed_joins',
    'Get confirmed table join relationships discovered during agent exploration sessions',
    {},
    async () => {
      try {
        const { adminSupabase, workspaceId } = await getAdminContext()

        // Fetch sessions that have confirmed_joins
        const { data: sessions, error } = await adminSupabase
          .from('workspace_agent_sessions')
          .select('session_id, status, created_at, updated_at')
          .eq('workspace_id', workspaceId)
          .eq('status', 'completed')
          .order('created_at', { ascending: false })

        if (error) {
          return toMcpError(new Error(`Failed to fetch sessions: ${error.message}`))
        }

        // Collect confirmed joins from EDA results (join_suggestions field)
        const { data: edaResults } = await adminSupabase
          .from('eda_results')
          .select('table_id, join_suggestions')
          .eq('workspace_id', workspaceId)

        const joins: Array<{ table_id: string; suggestions: Json }> = []
        if (edaResults) {
          for (const result of edaResults) {
            if (result.join_suggestions) {
              joins.push({
                table_id: result.table_id,
                suggestions: result.join_suggestions,
              })
            }
          }
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              confirmed_joins: joins,
              session_count: sessions?.length || 0,
            }, null, 2),
          }],
        }
      } catch (error) {
        return toMcpError(error)
      }
    }
  )
}
