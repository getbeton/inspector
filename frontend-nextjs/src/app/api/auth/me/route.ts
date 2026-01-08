import { createClient } from '@/lib/supabase/server'
import { getWorkspaceMembership } from '@/lib/supabase/helpers'
import { NextResponse } from 'next/server'

/**
 * GET /api/auth/me
 * Returns current authenticated user and workspace info
 */
export async function GET() {
  try {
    const supabase = await createClient()

    // Get current user
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    // Get user's workspace using helper
    const membership = await getWorkspaceMembership()

    if (!membership) {
      return NextResponse.json(
        { error: 'No workspace found' },
        { status: 404 }
      )
    }

    // Get workspace details
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('id, name, slug, subscription_status')
      .eq('id', membership.workspaceId)
      .single()

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.full_name || user.email?.split('@')[0],
        avatar_url: user.user_metadata?.avatar_url
      },
      workspace,
      role: membership.role
    })
  } catch (error) {
    console.error('Error in /api/auth/me:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
