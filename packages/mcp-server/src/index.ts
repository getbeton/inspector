/**
 * Beton MCP Server — Entry Point
 *
 * Starts the Express HTTP server with MCP Streamable HTTP transport.
 * Designed to run as a standalone Node.js process separate from
 * the Next.js application.
 */

import { createApp } from './transport.js'
import { createMcpServer } from './server.js'

const PORT = parseInt(process.env.PORT || '3001', 10)

// Validate required environment variables at startup
const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`)
    process.exit(1)
  }
}

const app = createApp(createMcpServer)

app.listen(PORT, () => {
  console.log(`Beton MCP Server running on port ${PORT}`)
  console.log(`  MCP endpoint: http://localhost:${PORT}/mcp`)
  console.log(`  OAuth metadata: http://localhost:${PORT}/.well-known/oauth-protected-resource`)
  console.log(`  Health check: http://localhost:${PORT}/health`)
})
