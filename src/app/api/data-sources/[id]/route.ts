/**
 * GET    /api/data-sources/[id]  — Get a single data source
 * PATCH  /api/data-sources/[id]  — Update individual fields
 * DELETE /api/data-sources/[id]  — Delete a data source
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireWorkspaceId } from '@/lib/supabase/helpers'
import { encrypt } from '@/lib/crypto/encryption'
import { validatePostgresHost } from '@/lib/integrations/postgres/security'
import type { UpdateDataSourceRequest } from '@/lib/integrations/postgres/types'

interface RouteParams {
  params: Promise<{ id: string }>
}

// Select columns excluding password_encrypted (never return to client)
const PUBLIC_COLUMNS = 'id, workspace_id, source_type, name, host, port, database_name, username, ssl_mode, config_json, status, last_validated_at, last_error, is_active, created_at, updated_at'

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const workspaceId = await requireWorkspaceId()
    const supabase = await createClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('data_sources')
      .select(PUBLIC_COLUMNS)
      .eq('workspace_id', workspaceId)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Data source not found' }, { status: 404 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data_source: data })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to get data source'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const workspaceId = await requireWorkspaceId()
    const body: UpdateDataSourceRequest = await req.json()

    // Build update object (only include fields that were provided)
    const updates: Record<string, unknown> = {}

    if (body.name !== undefined) updates.name = body.name.trim()
    if (body.host !== undefined) {
      // SSRF validate new host
      const ssrfError = await validatePostgresHost(body.host)
      if (ssrfError) {
        return NextResponse.json(
          { error: `Host validation failed: ${ssrfError}` },
          { status: 400 },
        )
      }
      updates.host = body.host.trim()
    }
    if (body.port !== undefined) updates.port = body.port
    if (body.database_name !== undefined) updates.database_name = body.database_name.trim()
    if (body.username !== undefined) updates.username = body.username.trim()
    if (body.password !== undefined) {
      updates.password_encrypted = await encrypt(body.password)
    }
    if (body.ssl_mode !== undefined) updates.ssl_mode = body.ssl_mode
    if (body.config_json !== undefined) updates.config_json = body.config_json

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    // Reset status when connection params change
    if (body.host || body.port || body.database_name || body.username || body.password || body.ssl_mode) {
      updates.status = 'pending'
      updates.last_error = null
    }

    const supabase = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('data_sources')
      .update(updates)
      .eq('workspace_id', workspaceId)
      .eq('id', id)
      .select(PUBLIC_COLUMNS)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Data source not found' }, { status: 404 })
      }
      if (error.code === '23505') {
        return NextResponse.json(
          { error: `A data source with that name already exists` },
          { status: 409 },
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data_source: data })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to update data source'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const workspaceId = await requireWorkspaceId()
    const supabase = await createClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('data_sources')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ deleted: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to delete data source'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
