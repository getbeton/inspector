/**
 * MCP Server factory
 *
 * Creates a McpServer instance with all 18 Beton tools registered.
 * Each tool delegates to the Next.js API via the proxy helper.
 * Authentication is forwarded via the getAuthHeader callback.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
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
 * @param getAuthHeader - Returns the current Authorization header value for this session
 */
export function createMcpServer(
  getAuthHeader: () => string | undefined
): McpServer {
  const server = new McpServer({
    name: 'beton',
    version: '0.2.0',
  })

  // Register all tool groups — each gets the auth header getter
  registerSignalTools(server, getAuthHeader)
  registerMemoryTools(server, getAuthHeader)
  registerWarehouseTools(server, getAuthHeader)
  registerJoinsTools(server, getAuthHeader)
  registerMappingTools(server, getAuthHeader)
  registerBillingTools(server, getAuthHeader)
  registerWorkspaceTools(server, getAuthHeader)

  return server
}
