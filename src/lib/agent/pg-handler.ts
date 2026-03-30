/**
 * Shared middleware for Postgres agent endpoints.
 *
 * Handles the common boilerplate across all /api/agent/pg/* routes:
 * auth → parse params → resolve session → rate limit → resolve data source
 *
 * Returns a ready-to-use context with { workspaceId, sessionUUID, dataSource }.
 */

import { NextRequest, NextResponse } from 'next/server'
import { validateAgentRequest } from '@/lib/agent/auth'
import { rateLimitResponse } from '@/lib/agent/rate-limit'
import { resolveSession } from '@/lib/agent/session'
import {
  getDataSourceAdmin,
  getDataSourceByNameAdmin,
} from '@/lib/integrations/postgres/credentials'
import type { DataSourceRecord } from '@/lib/integrations/postgres/types'

export interface PgAgentContext {
  workspaceId: string
  sessionUUID: string
  dataSource: DataSourceRecord
}

interface PgAgentOptions {
  maxRequests?: number // Rate limit override (default: 30)
}

/**
 * Wrap a Postgres agent route handler with shared middleware.
 *
 * Usage:
 * ```ts
 * export const GET = withPgAgentHandler(async (req, ctx) => {
 *   const result = await listSchemas(ctx.dataSource)
 *   return NextResponse.json(result)
 * })
 * ```
 */
export function withPgAgentHandler(
  handler: (req: NextRequest, ctx: PgAgentContext) => Promise<NextResponse>,
  options?: PgAgentOptions,
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    // Step 1: Validate agent auth
    if (!validateAgentRequest(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Step 2: Parse params (GET → searchParams, POST → body)
    let sessionId: string | null = null
    let dataSourceId: string | null = null
    let dataSourceName: string | null = null

    if (req.method === 'GET') {
      const params = req.nextUrl.searchParams
      sessionId = params.get('session_id')
      dataSourceId = params.get('data_source_id')
      dataSourceName = params.get('data_source_name')
    } else {
      // For POST, we need to clone the request so the handler can also read the body
      const body = await req.clone().json()
      sessionId = body.session_id ?? null
      dataSourceId = body.data_source_id ?? null
      dataSourceName = body.data_source_name ?? null
    }

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })
    }

    if (!dataSourceId && !dataSourceName) {
      return NextResponse.json(
        { error: 'Missing data_source_id or data_source_name' },
        { status: 400 },
      )
    }

    // Step 3: Resolve session → workspaceId
    let workspaceId: string
    let sessionUUID: string
    try {
      const session = await resolveSession(sessionId)
      workspaceId = session.workspaceId
      sessionUUID = session.sessionUUID
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Invalid session'
      return NextResponse.json({ error: msg }, { status: 404 })
    }

    // Step 4: Rate limit
    const limited = rateLimitResponse(workspaceId, {
      maxRequests: options?.maxRequests ?? 30,
    })
    if (limited) return limited

    // Step 5: Resolve data source
    let dataSource: DataSourceRecord | null = null
    try {
      if (dataSourceId) {
        dataSource = await getDataSourceAdmin(workspaceId, dataSourceId)
      } else if (dataSourceName) {
        dataSource = await getDataSourceByNameAdmin(workspaceId, dataSourceName)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to resolve data source'
      return NextResponse.json({ error: msg }, { status: 500 })
    }

    if (!dataSource) {
      return NextResponse.json(
        { error: `Data source not found${dataSourceName ? `: "${dataSourceName}"` : ''}` },
        { status: 404 },
      )
    }

    if (!dataSource.is_active) {
      return NextResponse.json(
        { error: 'Data source is inactive' },
        { status: 403 },
      )
    }

    // Step 6: Call the actual handler
    return handler(req, { workspaceId, sessionUUID, dataSource })
  }
}
