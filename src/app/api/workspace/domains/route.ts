import { NextRequest, NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PUBLIC_EMAIL_DOMAINS } from '@/lib/utils/email-domains'
import { requireRole, ForbiddenError } from '@/lib/auth/permissions'

/**
 * GET /api/workspace/domains
 *
 * List claimed domains for the current workspace.
 * Auth: any workspace member.
 */
export async function GET() {
  try {
    const { workspaceId } = await requireWorkspace()
    const adminClient = createAdminClient()

    const { data: domains, error } = await (adminClient as any)
      .from('workspace_domains')
      .select('id, domain, verified, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[Workspace Domains] Failed to fetch domains:', error)
      return NextResponse.json({ error: 'Failed to fetch domains' }, { status: 500 })
    }

    return NextResponse.json({ domains: domains || [] })
  } catch (err) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    if (err instanceof Error && err.message.includes('No workspace')) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }
    console.error('[Workspace Domains GET] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/workspace/domains
 *
 * Claim a domain for auto-join on the current workspace.
 * Auth: workspace member (RBAC enforced in Phase 8).
 * Validates:
 * - Domain is not a public email domain
 * - Domain is not already claimed by another workspace
 */
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, role } = await requireWorkspace()
    requireRole(role, ['owner'])
    const adminClient = createAdminClient()

    const body = await request.json()
    const { domain } = body

    if (!domain || typeof domain !== 'string') {
      return NextResponse.json(
        { error: 'domain is required' },
        { status: 400 }
      )
    }

    // Normalize domain to lowercase
    const normalizedDomain = domain.trim().toLowerCase()

    // Basic domain format validation
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(normalizedDomain)) {
      return NextResponse.json(
        { error: 'Invalid domain format' },
        { status: 400 }
      )
    }

    // Check against public email domains
    if (PUBLIC_EMAIL_DOMAINS.has(normalizedDomain)) {
      return NextResponse.json(
        { error: 'Public email domains (e.g. gmail.com) cannot be claimed' },
        { status: 400 }
      )
    }

    // Check if domain is already claimed by any workspace
    const { data: existing, error: checkError } = await (adminClient as any)
      .from('workspace_domains')
      .select('id, workspace_id')
      .eq('domain', normalizedDomain)
      .maybeSingle()

    if (checkError) {
      console.error('[Workspace Domains] Failed to check existing domain:', checkError)
      return NextResponse.json({ error: 'Failed to check domain availability' }, { status: 500 })
    }

    if (existing) {
      if (existing.workspace_id === workspaceId) {
        return NextResponse.json(
          { error: 'Domain is already claimed by this workspace' },
          { status: 409 }
        )
      }
      return NextResponse.json(
        { error: 'Domain is already claimed by another workspace' },
        { status: 409 }
      )
    }

    // Insert the domain claim
    const { data: created, error: insertError } = await (adminClient as any)
      .from('workspace_domains')
      .insert({
        workspace_id: workspaceId,
        domain: normalizedDomain,
      } as never)
      .select('id, domain, verified, created_at')
      .single()

    if (insertError) {
      console.error('[Workspace Domains] Failed to claim domain:', insertError)
      return NextResponse.json({ error: 'Failed to claim domain' }, { status: 500 })
    }

    return NextResponse.json({ domain: created }, { status: 201 })
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (err instanceof Error && err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    if (err instanceof Error && err.message.includes('No workspace')) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }
    console.error('[Workspace Domains POST] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
