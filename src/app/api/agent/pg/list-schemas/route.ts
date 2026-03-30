import { NextResponse } from 'next/server'
import { withPgAgentHandler } from '@/lib/agent/pg-handler'
import { listSchemas } from '@/lib/integrations/postgres/client'

export const GET = withPgAgentHandler(async (_req, { dataSource }) => {
  const schemas = await listSchemas(dataSource)
  return NextResponse.json({ schemas })
})
