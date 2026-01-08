import { createClient } from '@/lib/supabase/server'
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

    // Get user's workspace
    const { data: memberData, error: memberError } = await supabase
      .from('workspace_members')
      .select(`
        workspace_id,
        role,
        workspaces (
          id,
          name,
          slug,
          subscription_status
        )
      `)
      .eq('user_id', user.id)
      .single()

    if (memberError || !memberData) {
      return NextResponse.json(
        { error: 'No workspace found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.full_name || user.email?.split('@')[0],
        avatar_url: user.user_metadata?.avatar_url
      },
      workspace: memberData.workspaces,
      role: memberData.role
    })
  } catch (error) {
    console.error('Error in /api/auth/me:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
