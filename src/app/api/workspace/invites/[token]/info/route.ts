/**
 * GET /api/workspace/invites/[token]/info  — Public invite info (no auth required)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/workspace/invites/:token/info
 *
 * Returns public-safe metadata about an invite so the accept page can display
 * workspace name, role, and expiry before the user signs in or confirms.
 *
 * NO authentication required.
 *
 * Returns: { workspaceName, inviterEmail, role, expiresAt }
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Fetch invite with workspace join
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: invite, error } = await (admin as any)
      .from('workspace_invites')
      .select('*, workspaces(name)')
      .eq('token', token)
      .single()

    if (error || !invite) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    }

    // Validate expiry
    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Invite has expired' }, { status: 410 })
    }

    // Validate usage limit
    if (invite.max_uses !== null && invite.use_count >= invite.max_uses) {
      return NextResponse.json({ error: 'Invite is no longer valid' }, { status: 410 })
    }

    // Fetch inviter email (from auth.users via admin)
    let inviterEmail: string | null = null
    if (invite.invited_by) {
      const { data: inviterData } = await admin.auth.admin.getUserById(invite.invited_by)
      inviterEmail = inviterData?.user?.email ?? null
    }

    return NextResponse.json({
      workspaceName: invite.workspaces?.name ?? null,
      inviterEmail,
      role: invite.role ?? 'member',
      expiresAt: invite.expires_at,
    })
  } catch (err) {
    console.error('[Invite Info] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
