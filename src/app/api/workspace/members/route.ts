import { NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/workspace/members
 *
 * List all members of the current workspace.
 * Auth: any workspace member.
 * Uses admin client to join workspace_members with auth.users metadata.
 */
export async function GET() {
  try {
    const { workspaceId } = await requireWorkspace()
    const adminClient = createAdminClient()

    // Fetch workspace members
    const { data: members, error } = await (adminClient as any)
      .from('workspace_members')
      .select('user_id, role, joined_at')
      .eq('workspace_id', workspaceId)

    if (error) {
      console.error('[Workspace Members] Failed to fetch members:', error)
      return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 })
    }

    if (!members || members.length === 0) {
      return NextResponse.json({ members: [] })
    }

    // Fetch user details from auth.users via admin client
    const userIds = members.map((m: any) => m.user_id)
    const { data: authData, error: authError } = await adminClient.auth.admin.listUsers()

    if (authError) {
      console.error('[Workspace Members] Failed to fetch auth users:', authError)
      return NextResponse.json({ error: 'Failed to fetch user details' }, { status: 500 })
    }

    // Build a lookup map of user details
    const userMap = new Map<string, { email: string; name: string }>()
    for (const authUser of authData.users) {
      if (userIds.includes(authUser.id)) {
        userMap.set(authUser.id, {
          email: authUser.email || '',
          name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || '',
        })
      }
    }

    // Merge member rows with user details
    const result = members.map((m: any) => {
      const userInfo = userMap.get(m.user_id)
      return {
        userId: m.user_id,
        email: userInfo?.email || '',
        name: userInfo?.name || '',
        role: m.role,
        joinedAt: m.joined_at,
      }
    })

    return NextResponse.json({ members: result })
  } catch (err) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    if (err instanceof Error && err.message.includes('No workspace')) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }
    console.error('[Workspace Members] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
