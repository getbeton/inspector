/**
 * MCP Server factory
 *
 * Creates a McpServer instance with all 18 Beton tools registered.
 * Each tool receives a lazy context resolver — authentication and
 * workspace resolution happen only when a tool is actually called.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ToolContext, AdminToolContext } from './context/types.js'
import { registerSignalTools } from './tools/signals.js'
import { registerMemoryTools } from './tools/memory.js'
import { registerWarehouseTools } from './tools/warehouse.js'
import { registerJoinsTools } from './tools/joins.js'
import { registerMappingTools } from './tools/mapping.js'
import { registerBillingTools } from './tools/billing.js'
import { registerWorkspaceTools } from './tools/workspace.js'

/**
 * Create a fully configured MCP server with all tools.
 *
 * @param getContext - Lazy context resolver (validates JWT + resolves workspace on demand)
 * @param getAdminContext - Lazy admin context resolver (adds service role client)
 */
export function createMcpServer(
  getContext: () => Promise<ToolContext>,
  getAdminContext: () => Promise<AdminToolContext>
): McpServer {
  const server = new McpServer({
    name: 'beton',
    version: '0.1.0',
  })

  // Register all tool groups
  registerSignalTools(server, getContext)
  registerMemoryTools(server, getAdminContext)
  registerWarehouseTools(server, getContext)
  registerJoinsTools(server, getAdminContext)
  registerMappingTools(server, getContext)
  registerBillingTools(server, getContext)
  registerWorkspaceTools(server, getContext)

  return server
}
