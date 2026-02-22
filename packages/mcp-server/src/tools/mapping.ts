/**
 * Field Mapping tools (2 tools)
 *
 * - get_field_mappings: Current PostHog-to-Attio field mappings
 * - update_field_mappings: Configure field mappings programmatically
 */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ToolContext } from '../context/types.js'
import { toMcpError } from '../lib/errors.js'
import type { Json } from '../lib/copied/supabase-types.js'

export function registerMappingTools(
  server: McpServer,
  getContext: () => Promise<ToolContext>
): void {
  // ── get_field_mappings ─────────────────────────────────────────────
  server.tool(
    'get_field_mappings',
    'Get current PostHog-to-Attio field mappings from the integration config',
    {},
    async () => {
      try {
        const { supabase, workspaceId } = await getContext()

        const { data } = await supabase
          .from('integration_configs')
          .select('config_json')
          .eq('workspace_id', workspaceId)
          .eq('integration_name', 'attio')
          .single()

        if (!data) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ mappings: null, message: 'Attio integration not configured' }, null, 2),
            }],
          }
        }

        const configJson = data.config_json as Record<string, Json>
        const mappings = configJson.field_mappings || null

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ mappings }, null, 2),
          }],
        }
      } catch (error) {
        return toMcpError(error)
      }
    }
  )

  // ── update_field_mappings ──────────────────────────────────────────
  server.tool(
    'update_field_mappings',
    'Update PostHog-to-Attio field mappings. Merges with existing config_json.',
    {
      mappings: z.record(z.string(), z.string()).describe('Map of PostHog field names to Attio attribute names'),
    },
    async ({ mappings }) => {
      try {
        const { supabase, workspaceId } = await getContext()

        // Get existing config
        const { data: existing } = await supabase
          .from('integration_configs')
          .select('id, config_json')
          .eq('workspace_id', workspaceId)
          .eq('integration_name', 'attio')
          .single()

        if (!existing) {
          return toMcpError(new Error('Attio integration not configured. Connect Attio first.'))
        }

        // Merge new mappings into existing config_json
        const existingConfig = (existing.config_json as Record<string, Json>) || {}
        const updatedConfig = {
          ...existingConfig,
          field_mappings: mappings,
        }

        const { error } = await supabase
          .from('integration_configs')
          .update({ config_json: updatedConfig as Json })
          .eq('id', existing.id)

        if (error) {
          return toMcpError(new Error(`Failed to update mappings: ${error.message}`))
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: true, mappings }, null, 2),
          }],
        }
      } catch (error) {
        return toMcpError(error)
      }
    }
  )
}
