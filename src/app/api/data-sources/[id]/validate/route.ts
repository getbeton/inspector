/**
 * POST /api/data-sources/[id]/validate
 *
 * Test the database connection and update the data source status.
 * Uses the admin client to read the encrypted password, creates a
 * temporary connection, and updates status to 'connected' or 'error'.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireWorkspaceId } from '@/lib/supabase/helpers'
import { getDataSourceAdmin, updateDataSourceStatus } from '@/lib/integrations/postgres/credentials'
import { testConnection } from '@/lib/integrations/postgres/client'
import type { DataSourceRecord } from '@/lib/integrations/postgres/types'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const workspaceId = await requireWorkspaceId()

    // Fetch data source with encrypted password (admin client)
    const dataSource = await getDataSourceAdmin(workspaceId, id)
    if (!dataSource) {
      return NextResponse.json({ error: 'Data source not found' }, { status: 404 })
    }

    // Test the connection
    try {
      await testConnection(dataSource as DataSourceRecord)
      await updateDataSourceStatus(id, 'connected')
      return NextResponse.json({
        status: 'connected',
        message: 'Connection successful',
      })
    } catch (connError) {
      const errorMessage =
        connError instanceof Error ? connError.message : 'Connection failed'
      await updateDataSourceStatus(id, 'error', errorMessage)
      return NextResponse.json(
        {
          status: 'error',
          message: errorMessage,
        },
        { status: 422 },
      )
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Validation failed'
    if (message === 'No workspace found') {
      return NextResponse.json({ error: 'No workspace' }, { status: 404 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
