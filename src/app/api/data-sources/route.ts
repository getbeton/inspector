/**
 * GET  /api/data-sources       — List all data sources for workspace
 * POST /api/data-sources       — Create a new data source
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireWorkspaceId } from '@/lib/supabase/helpers'
import { encrypt } from '@/lib/crypto/encryption'
import { validatePostgresHost } from '@/lib/integrations/postgres/security'
import type { CreateDataSourceRequest } from '@/lib/integrations/postgres/types'

export async function GET() {
  try {
    const workspaceId = await requireWorkspaceId()
    const supabase = await createClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('data_sources')
      .select('id, workspace_id, source_type, name, host, port, database_name, username, ssl_mode, config_json, status, last_validated_at, last_error, is_active, created_at, updated_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data_sources: data })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to list data sources'
    if (message === 'No workspace found') {
      return NextResponse.json({ error: 'No workspace' }, { status: 404 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const workspaceId = await requireWorkspaceId()
    const body: CreateDataSourceRequest = await req.json()

    // Validate required fields
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    if (!body.host?.trim()) {
      return NextResponse.json({ error: 'Host is required' }, { status: 400 })
    }
    if (!body.database_name?.trim()) {
      return NextResponse.json({ error: 'Database name is required' }, { status: 400 })
    }
    if (!body.username?.trim()) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 })
    }
    if (!body.password) {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 })
    }

    // SSRF validation
    const ssrfError = await validatePostgresHost(body.host)
    if (ssrfError) {
      return NextResponse.json(
        { error: `Host validation failed: ${ssrfError}` },
        { status: 400 },
      )
    }

    // Encrypt password
    const passwordEncrypted = await encrypt(body.password)

    const supabase = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('data_sources')
      .insert({
        workspace_id: workspaceId,
        source_type: 'postgres',
        name: body.name.trim(),
        host: body.host.trim(),
        port: body.port ?? 5432,
        database_name: body.database_name.trim(),
        username: body.username.trim(),
        password_encrypted: passwordEncrypted,
        ssl_mode: body.ssl_mode ?? 'require',
        config_json: body.config_json ?? {},
        status: 'pending',
      } as Record<string, unknown>)
      .select('id, workspace_id, source_type, name, host, port, database_name, username, ssl_mode, config_json, status, last_validated_at, last_error, is_active, created_at, updated_at')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: `A data source named "${body.name}" already exists in this workspace` },
          { status: 409 },
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data_source: data }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to create data source'
    if (message === 'No workspace found') {
      return NextResponse.json({ error: 'No workspace' }, { status: 404 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
