import { NextResponse } from 'next/server'
import { withPgAgentHandler } from '@/lib/agent/pg-handler'
import { executeQuery } from '@/lib/integrations/postgres/client'
import { createModuleLogger } from '@/lib/utils/logger'

const log = createModuleLogger('[API][Agent][PgQuery]')

export const POST = withPgAgentHandler(
  async (req, { workspaceId, dataSource }) => {
    const body = await req.json()
    const { query } = body

    if (!query) {
      return NextResponse.json({ error: 'Missing query' }, { status: 400 })
    }

    // Audit log
    log.warn(
      `[AUDIT] PG query workspace=${workspaceId} ds=${dataSource.id} query=${query.substring(0, 500)}`,
    )

    try {
      const result = await executeQuery(dataSource, query)
      return NextResponse.json(result)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Query execution failed'
      // Distinguish validation errors from execution errors
      const status = message.includes('dangerous') || message.includes('Only SELECT') || message.includes('multiple') || message.includes('empty') || message.includes('length')
        ? 400
        : 500
      return NextResponse.json({ error: message }, { status })
    }
  },
  { maxRequests: 20 },
)
