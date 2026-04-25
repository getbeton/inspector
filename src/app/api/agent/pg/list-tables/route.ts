import { NextResponse } from 'next/server'
import { withPgAgentHandler } from '@/lib/agent/pg-handler'
import { listTables } from '@/lib/integrations/postgres/client'

export const GET = withPgAgentHandler(async (req, { dataSource }) => {
  const schema = req.nextUrl.searchParams.get('schema') ?? 'public'
  const tables = await listTables(dataSource, schema)
  return NextResponse.json({ tables, schema })
})
