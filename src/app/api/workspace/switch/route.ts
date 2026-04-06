import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ACTIVE_WORKSPACE_COOKIE } from '@/lib/auth/constants'

/**
 * POST /api/workspace/switch
 *
 * Switch the active workspace for the current user.
 * Auth: authenticated user.
 * Sets the active workspace cookie on the response.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json()
    const { workspaceId } = body

    if (!workspaceId || typeof workspaceId !== 'string') {
      return NextResponse.json(
        { error: 'workspaceId is required' },
        { status: 400 }
      )
    }

    const adminClient = createAdminClient()

    // Verify user is a member of the target workspace
    const { data: membership, error: memberError } = await (adminClient as any)
      .from('workspace_members')
      .select('workspace_id, role, workspaces(id, name, slug)')
      .eq('user_id', user.id)
      .eq('workspace_id', workspaceId)
      .single()

    if (memberError || !membership) {
      return NextResponse.json(
        { error: 'You are not a member of this workspace' },
        { status: 403 }
      )
    }

    const workspace = membership.workspaces as { id: string; name: string; slug: string } | null

    // Build response with cookie
    const response = NextResponse.json({
      workspaceId: membership.workspace_id,
      workspaceName: workspace?.name || '',
    })

    response.cookies.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365, // 365 days
      secure: process.env.NODE_ENV === 'production',
    })

    return response
  } catch (err) {
    console.error('[Workspace Switch] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
