import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWorkspaceMembership } from '@/lib/supabase/helpers'
import { NextResponse, type NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LogEntry {
  tool_name: string
  status: 'success' | 'error'
  status_code?: number
  duration_ms?: number
  request_params?: Record<string, unknown>
  error_message?: string
  session_id?: string
}

/** Row shape returned by SELECT on mcp_request_logs (not yet in auto-generated types). */
interface McpLogRow {
  id: string
  tool_name: string
  status: string
  status_code: number | null
  duration_ms: number | null
  request_params: Record<string, unknown> | null
  error_message: string | null
  session_id: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// M5 fix: Server-side sanitization of request params before storage
// ---------------------------------------------------------------------------

const SENSITIVE_KEY_PATTERN = /token|secret|key|password|credential|auth/i
const JWT_VALUE_PATTERN = /^ey[A-Za-z0-9_-]+\./
const MAX_PARAM_VALUE_LENGTH = 1000

function sanitizeRequestParams(params: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(params)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      sanitized[key] = '[REDACTED]'
    } else if (typeof value === 'string' && JWT_VALUE_PATTERN.test(value)) {
      sanitized[key] = '[REDACTED_JWT]'
    } else if (typeof value === 'string' && value.length > MAX_PARAM_VALUE_LENGTH) {
      sanitized[key] = value.substring(0, MAX_PARAM_VALUE_LENGTH) + '...[truncated]'
    } else {
      sanitized[key] = value
    }
  }
  return sanitized
}

// ---------------------------------------------------------------------------
// GET /api/mcp/logs — cursor-paginated log query
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const membership = await getWorkspaceMembership()
    if (!membership) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    const params = request.nextUrl.searchParams
    const limit = Math.min(Math.max(Number(params.get('limit')) || 50, 1), 100)
    const cursor = params.get('cursor')
    const toolName = params.get('tool_name')
    const status = params.get('status')
    const sessionId = params.get('session_id')

    // Build query — cast needed because mcp_request_logs is not yet in auto-generated types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase as any)
      .from('mcp_request_logs')
      .select('id, tool_name, status, status_code, duration_ms, request_params, error_message, session_id, created_at')
      .eq('workspace_id', membership.workspaceId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1) // fetch one extra to detect next page

    // Cursor-based pagination: decode cursor as "created_at|id"
    if (cursor) {
      try {
        const decoded = Buffer.from(cursor, 'base64').toString('utf-8')
        const [cursorTime, cursorId] = decoded.split('|')
        if (cursorTime && cursorId) {
          // Use .or() for composite cursor: (created_at < cursor_time) OR (created_at = cursor_time AND id < cursor_id)
          query = query.or(
            `created_at.lt.${cursorTime},and(created_at.eq.${cursorTime},id.lt.${cursorId})`,
          )
        }
      } catch {
        return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 })
      }
    }

    // Optional filters
    if (toolName) query = query.eq('tool_name', toolName)
    if (status === 'success' || status === 'error') query = query.eq('status', status)
    if (sessionId) query = query.eq('session_id', sessionId)

    const { data, error } = await query as { data: McpLogRow[] | null; error: { message: string } | null }

    if (error) {
      console.error('Error fetching MCP logs:', error)
      return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 })
    }

    const rows = data ?? []
    const hasMore = rows.length > limit
    const pageRows = hasMore ? rows.slice(0, limit) : rows

    // Build next cursor from the last row returned
    let nextCursor: string | null = null
    if (hasMore && pageRows.length > 0) {
      const last = pageRows[pageRows.length - 1]
      nextCursor = Buffer.from(`${last.created_at}|${last.id}`).toString('base64')
    }

    return NextResponse.json({ data: pageRows, nextCursor })
  } catch (error) {
    console.error('Error in GET /api/mcp/logs:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// POST /api/mcp/logs — ingest log entries from MCP server
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const membership = await getWorkspaceMembership()
    if (!membership) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    // Accept single entry or batch
    const entries: LogEntry[] = Array.isArray(body) ? body : [body]

    if (entries.length === 0) {
      return NextResponse.json({ error: 'No log entries provided' }, { status: 400 })
    }

    if (entries.length > 100) {
      return NextResponse.json({ error: 'Maximum 100 entries per batch' }, { status: 400 })
    }

    // Use admin client for insert (bypasses RLS, validated via user auth above)
    const admin = createAdminClient()

    // M5 fix: Sanitize request_params server-side before storage
    const rows = entries.map((entry) => ({
      workspace_id: membership.workspaceId,
      tool_name: entry.tool_name,
      status: entry.status || 'success',
      status_code: entry.status_code ?? null,
      duration_ms: entry.duration_ms ?? null,
      request_params: entry.request_params ? sanitizeRequestParams(entry.request_params) : null,
      error_message: entry.error_message ? entry.error_message.substring(0, 1000) : null,
      session_id: entry.session_id ?? null,
    }))

    // Cast: mcp_request_logs not yet in auto-generated types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any)
      .from('mcp_request_logs')
      .insert(rows) as { error: { message: string } | null }

    if (error) {
      console.error('Error inserting MCP log entries:', error)
      return NextResponse.json({ error: 'Failed to insert logs' }, { status: 500 })
    }

    return NextResponse.json({ success: true, count: rows.length })
  } catch (error) {
    console.error('Error in POST /api/mcp/logs:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
