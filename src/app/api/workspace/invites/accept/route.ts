/**
 * POST /api/workspace/invites/accept  — Accept an invite token
 */

import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/workspace/invites/accept
 *
 * Accepts a workspace invite. The user must be authenticated but does NOT
 * need to already belong to a workspace (they may be accepting their first
 * invite).
 *
 * Body: { token: string }
 *
 * Uses the admin client to bypass RLS because the accepting user is not yet
 * a member of the target workspace.
 *
 * Returns: { workspaceId, workspaceName, role }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json()
    const { token } = body as { token?: string }

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'token is required' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Fetch the invite by token
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: invite, error: fetchError } = await (admin as any)
      .from('workspace_invites')
      .select('*')
      .eq('token', token)
      .single()

    if (fetchError || !invite) {
      return NextResponse.json({ error: 'Invalid invite token' }, { status: 404 })
    }

    // Validate expiry
    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Invite has expired' }, { status: 410 })
    }

    // Validate usage limit (max_uses = null means unlimited)
    if (invite.max_uses !== null && invite.use_count >= invite.max_uses) {
      return NextResponse.json({ error: 'Invite has reached its usage limit' }, { status: 410 })
    }

    // Check if user is already a member of this workspace
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingMember } = await (admin as any)
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .eq('workspace_id', invite.workspace_id)
      .single()

    if (existingMember) {
      // Already a member — return success (idempotent)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: ws } = await (admin as any)
        .from('workspaces')
        .select('name')
        .eq('id', invite.workspace_id)
        .single()

      return NextResponse.json({
        workspaceId: invite.workspace_id,
        workspaceName: ws?.name ?? null,
        role: existingMember.role,
        alreadyMember: true,
      })
    }

    // Add user to workspace_members
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: memberError } = await (admin as any)
      .from('workspace_members')
      .insert({
        workspace_id: invite.workspace_id,
        user_id: user.id,
        role: invite.role ?? 'member',
      })

    if (memberError) {
      console.error('[Invite Accept] Failed to add member:', memberError)
      return NextResponse.json({ error: 'Failed to join workspace' }, { status: 500 })
    }

    // Update the invite: increment use_count, set accepted fields for email invites
    const updateFields: Record<string, unknown> = {
      use_count: (invite.use_count ?? 0) + 1,
    }
    if (invite.invite_type === 'email') {
      updateFields.accepted_at = new Date().toISOString()
      updateFields.accepted_by = user.id
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any)
      .from('workspace_invites')
      .update(updateFields)
      .eq('id', invite.id)

    // Fetch workspace name for response
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: workspace } = await (admin as any)
      .from('workspaces')
      .select('name')
      .eq('id', invite.workspace_id)
      .single()

    return NextResponse.json({
      workspaceId: invite.workspace_id,
      workspaceName: workspace?.name ?? null,
      role: invite.role ?? 'member',
    })
  } catch (err) {
    console.error('[Invite Accept] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
