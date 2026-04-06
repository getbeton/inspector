/**
 * DELETE /api/workspace/invites/[id]  — Revoke (hard-delete) an invite
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireWorkspace, createClient } from '@/lib/supabase/server'
import { requireRole, ForbiddenError } from '@/lib/auth/permissions'

/**
 * DELETE /api/workspace/invites/:id
 *
 * Hard-deletes an invite row. The caller must be a member of the workspace
 * that owns the invite.
 *
 * Auth: any workspace member (via requireWorkspace).
 * Returns 204 on success.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspaceId, role } = await requireWorkspace()
    requireRole(role, ['owner', 'admin'])
    const { id } = await params
    const supabase = await createClient()

    // Delete only if invite belongs to the caller's workspace
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error, count } = await (supabase as any)
      .from('workspace_invites')
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('workspace_id', workspaceId)

    if (error) {
      console.error('[Invites DELETE] Delete failed:', error)
      return NextResponse.json({ error: 'Failed to revoke invite' }, { status: 500 })
    }

    if (count === 0) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
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
    console.error('[Invites DELETE] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
