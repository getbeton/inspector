import { NextRequest, NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, ForbiddenError } from '@/lib/auth/permissions'

/**
 * PATCH /api/workspace/members/[userId]
 *
 * Update a member's role within the current workspace.
 * Auth: workspace member (RBAC enforced in Phase 8).
 * Constraints:
 * - Cannot change own role
 * - Cannot change the owner's role
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId: targetUserId } = await params
    const { user, workspaceId, role: callerRole } = await requireWorkspace()
    requireRole(callerRole, ['owner'])
    const adminClient = createAdminClient()

    // Cannot change own role
    if (targetUserId === user.id) {
      return NextResponse.json(
        { error: 'Cannot change your own role' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { role } = body

    if (!role || !['admin', 'member'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be "admin" or "member"' },
        { status: 400 }
      )
    }

    // Check the target member exists and is not the owner
    const { data: targetMember, error: fetchError } = await (adminClient as any)
      .from('workspace_members')
      .select('user_id, role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', targetUserId)
      .single()

    if (fetchError || !targetMember) {
      return NextResponse.json(
        { error: 'Member not found in this workspace' },
        { status: 404 }
      )
    }

    if (targetMember.role === 'owner') {
      return NextResponse.json(
        { error: 'Cannot change the owner\'s role' },
        { status: 403 }
      )
    }

    // Update the role
    const { data: updated, error: updateError } = await (adminClient as any)
      .from('workspace_members')
      .update({ role } as never)
      .eq('workspace_id', workspaceId)
      .eq('user_id', targetUserId)
      .select('user_id, role, created_at')
      .single()

    if (updateError) {
      console.error('[Workspace Members] Failed to update role:', updateError)
      return NextResponse.json({ error: 'Failed to update member role' }, { status: 500 })
    }

    return NextResponse.json({
      member: {
        userId: updated.user_id,
        role: updated.role,
        joinedAt: updated.created_at,
      },
    })
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
    console.error('[Workspace Members PATCH] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/workspace/members/[userId]
 *
 * Remove a member from the current workspace.
 * Auth: workspace member (RBAC enforced in Phase 8).
 * Constraints:
 * - Cannot remove self (use "leave workspace" instead)
 * - Cannot remove the owner
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId: targetUserId } = await params
    const { user, workspaceId, role: callerRole } = await requireWorkspace()
    requireRole(callerRole, ['owner', 'admin'])
    const adminClient = createAdminClient()

    // Cannot remove self
    if (targetUserId === user.id) {
      return NextResponse.json(
        { error: 'Cannot remove yourself. Use "leave workspace" instead' },
        { status: 400 }
      )
    }

    // Check the target member exists and is not the owner
    const { data: targetMember, error: fetchError } = await (adminClient as any)
      .from('workspace_members')
      .select('user_id, role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', targetUserId)
      .single()

    if (fetchError || !targetMember) {
      return NextResponse.json(
        { error: 'Member not found in this workspace' },
        { status: 404 }
      )
    }

    if (targetMember.role === 'owner') {
      return NextResponse.json(
        { error: 'Cannot remove the workspace owner' },
        { status: 403 }
      )
    }

    // Delete the membership
    const { error: deleteError } = await (adminClient as any)
      .from('workspace_members')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('user_id', targetUserId)

    if (deleteError) {
      console.error('[Workspace Members] Failed to remove member:', deleteError)
      return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 })
    }

    return new NextResponse(null, { status: 204 })
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
    console.error('[Workspace Members DELETE] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
