/**
 * Beton MCP Server — Entry Point
 *
 * Thin proxy server that delegates all business logic to the Next.js app.
 * Only requires NEXT_APP_URL and PORT environment variables.
 */

import { createApp } from './transport.js'

const PORT = parseInt(process.env.PORT || '3001', 10)

// Validate the app URL is reachable (soft check — doesn't block startup)
const appUrl = process.env.NEXT_APP_URL || 'http://localhost:3000'
console.log(`Beton MCP Server configured to proxy to: ${appUrl}`)

const app = createApp()

app.listen(PORT, () => {
  console.log(`Beton MCP Server running on port ${PORT}`)
  console.log(`  MCP endpoint: http://localhost:${PORT}/mcp`)
  console.log(`  Health check: http://localhost:${PORT}/health`)
})
