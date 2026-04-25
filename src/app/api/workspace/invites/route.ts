/**
 * GET  /api/workspace/invites  — List active invites for the current workspace
 * POST /api/workspace/invites  — Create new invite(s)
 */

import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireWorkspace, createClient } from '@/lib/supabase/server'
import { requireRole, ForbiddenError } from '@/lib/auth/permissions'

/**
 * GET /api/workspace/invites
 *
 * Returns all non-expired invites for the authenticated user's workspace.
 * Auth: any workspace member (via requireWorkspace).
 */
export async function GET() {
  try {
    const { workspaceId } = await requireWorkspace()
    const supabase = await createClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('workspace_invites')
      .select('*')
      .eq('workspace_id', workspaceId)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[Invites GET] Query failed:', error)
      return NextResponse.json({ error: 'Failed to fetch invites' }, { status: 500 })
    }

    return NextResponse.json({ invites: data ?? [] })
  } catch (err) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    if (err instanceof Error && err.message.includes('No workspace')) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }
    console.error('[Invites GET] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/workspace/invites
 *
 * Create invite(s) for the workspace.
 *
 * Body:
 *   emails?: string[]       — required for type 'email'
 *   type: 'email' | 'link'
 *   role?: 'admin' | 'member'  — defaults to 'member'
 *   expiresInDays?: number     — email default 7, link default 30
 *
 * For 'email': creates one invite per email (max_uses = 1 each).
 * For 'link': creates a single invite (max_uses = null, unlimited).
 */
export async function POST(request: NextRequest) {
  try {
    const { user, workspaceId, role: callerRole } = await requireWorkspace()
    requireRole(callerRole, ['owner', 'admin'])
    const supabase = await createClient()
    const body = await request.json()

    const { emails, type, role, expiresInDays } = body as {
      emails?: string[]
      type?: string
      role?: string
      expiresInDays?: number
    }

    // Validate type
    if (!type || !['email', 'link'].includes(type)) {
      return NextResponse.json(
        { error: 'type must be "email" or "link"' },
        { status: 400 }
      )
    }

    // Validate role if provided
    if (role && !['admin', 'member'].includes(role)) {
      return NextResponse.json(
        { error: 'role must be "admin" or "member"' },
        { status: 400 }
      )
    }

    const inviteRole = role ?? 'member'

    if (type === 'email') {
      // Validate emails
      if (!emails || !Array.isArray(emails) || emails.length === 0) {
        return NextResponse.json(
          { error: 'emails array is required for email invites' },
          { status: 400 }
        )
      }

      if (emails.length > 50) {
        return NextResponse.json(
          { error: 'Maximum 50 email invites per request' },
          { status: 400 }
        )
      }

      const defaultExpiry = expiresInDays ?? 7
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + defaultExpiry)

      const inviteRows = emails.map((email: string) => ({
        workspace_id: workspaceId,
        email: email.toLowerCase().trim(),
        role: inviteRole,
        token: crypto.randomUUID(),
        invite_type: 'email',
        invited_by: user.id,
        expires_at: expiresAt.toISOString(),
        max_uses: 1,
        use_count: 0,
      }))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('workspace_invites')
        .insert(inviteRows)
        .select()

      if (error) {
        console.error('[Invites POST] Insert (email) failed:', error)
        return NextResponse.json({ error: 'Failed to create invites' }, { status: 500 })
      }

      return NextResponse.json({ invites: data }, { status: 201 })
    }

    // type === 'link'
    const defaultExpiry = expiresInDays ?? 30
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + defaultExpiry)

    const inviteRow = {
      workspace_id: workspaceId,
      email: null,
      role: inviteRole,
      token: crypto.randomUUID(),
      invite_type: 'link',
      invited_by: user.id,
      expires_at: expiresAt.toISOString(),
      max_uses: null, // unlimited
      use_count: 0,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('workspace_invites')
      .insert(inviteRow)
      .select()
      .single()

    if (error) {
      console.error('[Invites POST] Insert (link) failed:', error)
      return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
    }

    return NextResponse.json({ invite: data }, { status: 201 })
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
    console.error('[Invites POST] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
