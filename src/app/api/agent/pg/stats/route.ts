import { NextResponse } from 'next/server'
import { withPgAgentHandler } from '@/lib/agent/pg-handler'
import { getTableStats } from '@/lib/integrations/postgres/client'

export const GET = withPgAgentHandler(async (req, { dataSource }) => {
  const schema = req.nextUrl.searchParams.get('schema') ?? 'public'
  const stats = await getTableStats(dataSource, schema)
  return NextResponse.json({ stats, schema })
})
