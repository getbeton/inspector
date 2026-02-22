/**
 * Memory tools — Read Only (3 tools)
 *
 * These tools use the admin (service role) Supabase client because they
 * need cross-table joins that RLS doesn't permit. Workspace isolation
 * is enforced explicitly via workspace_id filters.
 *
 * - list_exploration_sessions: Past agent sessions with status, EDA counts
 * - get_eda_results: EDA results (join suggestions, metrics, table stats)
 * - get_website_exploration: Website analysis (B2B, PLG type, ICP, pricing)
 */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AdminToolContext } from '../context/types.js'
import { toMcpError } from '../lib/errors.js'

export function registerMemoryTools(
  server: McpServer,
  getAdminContext: () => Promise<AdminToolContext>
): void {
  // ── list_exploration_sessions ──────────────────────────────────────
  server.tool(
    'list_exploration_sessions',
    'List past agent exploration sessions with status and EDA result counts',
    {
      status: z.enum(['created', 'running', 'completed', 'failed', 'closed']).optional().describe('Filter by session status'),
      limit: z.number().int().min(1).max(50).default(20).describe('Max results to return'),
    },
    async ({ status, limit }) => {
      try {
        const { adminSupabase, workspaceId } = await getAdminContext()

        let query = adminSupabase
          .from('workspace_agent_sessions')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false })
          .limit(limit)

        if (status) {
          query = query.eq('status', status)
        }

        const { data: sessions, error } = await query

        if (error) {
          return toMcpError(new Error(`Failed to fetch sessions: ${error.message}`))
        }

        // Count EDA results for each session
        const enrichedSessions = await Promise.all(
          (sessions || []).map(async (session) => {
            const { count } = await adminSupabase
              .from('eda_results')
              .select('*', { count: 'exact', head: true })
              .eq('workspace_id', workspaceId)

            return {
              ...session,
              eda_result_count: count || 0,
            }
          })
        )

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ sessions: enrichedSessions }, null, 2),
          }],
        }
      } catch (error) {
        return toMcpError(error)
      }
    }
  )

  // ── get_eda_results ────────────────────────────────────────────────
  server.tool(
    'get_eda_results',
    'Get exploratory data analysis results including join suggestions, metrics discovery, and table statistics',
    {
      table_id: z.string().optional().describe('Filter by specific table ID'),
    },
    async ({ table_id }) => {
      try {
        const { adminSupabase, workspaceId } = await getAdminContext()

        let query = adminSupabase
          .from('eda_results')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('updated_at', { ascending: false })

        if (table_id) {
          query = query.eq('table_id', table_id)
        }

        const { data, error } = await query

        if (error) {
          return toMcpError(new Error(`Failed to fetch EDA results: ${error.message}`))
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ eda_results: data || [] }, null, 2),
          }],
        }
      } catch (error) {
        return toMcpError(error)
      }
    }
  )

  // ── get_website_exploration ────────────────────────────────────────
  server.tool(
    'get_website_exploration',
    'Get website analysis results: B2B classification, PLG type, ICP description, pricing model',
    {},
    async () => {
      try {
        const { adminSupabase, workspaceId } = await getAdminContext()

        const { data, error } = await adminSupabase
          .from('website_exploration_results')
          .select('*')
          .eq('workspace_id', workspaceId)
          .single()

        if (error) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ website_exploration: null, message: 'No website exploration results found' }, null, 2),
            }],
          }
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ website_exploration: data }, null, 2),
          }],
        }
      } catch (error) {
        return toMcpError(error)
      }
    }
  )
}
