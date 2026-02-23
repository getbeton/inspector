/**
 * Type declarations for @modelcontextprotocol/sdk
 *
 * The SDK v1.26.0 ships .d.ts.map files but not .d.ts files
 * (tsgo build tool packaging issue). This file provides the
 * minimal type surface we need for our thin proxy tools.
 */

declare module '@modelcontextprotocol/sdk/server/mcp.js' {
  import type { ZodRawShape } from 'zod'

  interface McpServerOptions {
    name: string
    version: string
  }

  type ToolResult = {
    content: Array<{ type: 'text'; text: string }>
    isError?: boolean
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type ToolHandler = (args: any) => Promise<ToolResult>

  export class McpServer {
    constructor(options: McpServerOptions)
    tool(
      name: string,
      description: string,
      schema: ZodRawShape,
      handler: ToolHandler
    ): void
    connect(transport: unknown): Promise<void>
  }
}

declare module '@modelcontextprotocol/sdk/server/streamableHttp.js' {
  interface StreamableHTTPServerTransportOptions {
    sessionIdGenerator?: () => string
    onsessioninitialized?: (sessionId: string) => void
  }

  export class StreamableHTTPServerTransport {
    sessionId: string | null
    onclose: (() => void) | null

    constructor(options?: StreamableHTTPServerTransportOptions)
    handleRequest(req: unknown, res: unknown, body?: unknown): Promise<void>
  }
}

declare module '@modelcontextprotocol/sdk/types.js' {
  export class McpError extends Error {
    constructor(code: number, message: string)
  }

  export const ErrorCode: {
    InvalidRequest: number
    InternalError: number
    MethodNotFound: number
    InvalidParams: number
  }
}
