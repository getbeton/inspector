import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/workspace/list
 *
 * List all workspaces the current user belongs to.
 * Auth: authenticated user.
 */
export async function GET() {
  try {
    const user = await getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const adminClient = createAdminClient()

    const { data: memberships, error } = await (adminClient as any)
      .from('workspace_members')
      .select('workspace_id, role, joined_at, workspaces(id, name, slug)')
      .eq('user_id', user.id)
      .order('joined_at', { ascending: true })

    if (error) {
      console.error('[Workspace List] Failed to fetch workspaces:', error)
      return NextResponse.json({ error: 'Failed to fetch workspaces' }, { status: 500 })
    }

    const workspaces = (memberships || []).map((m: any) => {
      const ws = m.workspaces as { id: string; name: string; slug: string } | null
      return {
        workspaceId: m.workspace_id,
        workspaceName: ws?.name || '',
        workspaceSlug: ws?.slug || '',
        role: m.role,
        joinedAt: m.joined_at,
      }
    })

    return NextResponse.json({ workspaces })
  } catch (err) {
    console.error('[Workspace List] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
