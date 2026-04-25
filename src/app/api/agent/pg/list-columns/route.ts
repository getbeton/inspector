import { NextResponse } from 'next/server'
import { withPgAgentHandler } from '@/lib/agent/pg-handler'
import { listColumns } from '@/lib/integrations/postgres/client'

export const GET = withPgAgentHandler(async (req, { dataSource }) => {
  const table = req.nextUrl.searchParams.get('table')
  const schema = req.nextUrl.searchParams.get('schema') ?? 'public'

  if (!table) {
    return NextResponse.json({ error: 'Missing table parameter' }, { status: 400 })
  }

  const columns = await listColumns(dataSource, table, schema)
  return NextResponse.json({ columns, table, schema })
})
