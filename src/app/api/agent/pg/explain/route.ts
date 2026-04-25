import { NextResponse } from 'next/server'
import { withPgAgentHandler } from '@/lib/agent/pg-handler'
import { explainQuery } from '@/lib/integrations/postgres/client'

export const POST = withPgAgentHandler(
  async (req, { dataSource }) => {
    const body = await req.json()
    const { query } = body

    if (!query) {
      return NextResponse.json({ error: 'Missing query' }, { status: 400 })
    }

    try {
      const result = await explainQuery(dataSource, query)
      return NextResponse.json(result)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'EXPLAIN failed'
      const status = message.includes('dangerous') || message.includes('Only SELECT')
        ? 400
        : 500
      return NextResponse.json({ error: message }, { status })
    }
  },
  { maxRequests: 20 },
)
