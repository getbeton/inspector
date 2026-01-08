import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /api/user/workspace
 * Get or create workspace for current user
 */
export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Try to get existing workspace
    const { data: memberData, error: memberError } = await supabase
      .from('workspace_members')
      .select(`
        workspace_id,
        role,
        workspaces (
          id,
          name,
          slug,
          subscription_status,
          stripe_customer_id,
          created_at
        )
      `)
      .eq('user_id', user.id)
      .single()

    if (memberData?.workspaces) {
      return NextResponse.json({
        workspace: memberData.workspaces,
        role: memberData.role
      })
    }

    // Create new workspace if none exists
    const email = user.email || 'user'
    const slug = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-')
    const name = user.user_metadata?.full_name || email.split('@')[0]

    const { data: newWorkspace, error: createError } = await supabase
      .from('workspaces')
      .insert({
        name: `${name}'s Workspace`,
        slug: `${slug}-${Date.now()}`
      })
      .select()
      .single()

    if (createError || !newWorkspace) {
      console.error('Error creating workspace:', createError)
      return NextResponse.json(
        { error: 'Failed to create workspace' },
        { status: 500 }
      )
    }

    // Add user as owner
    const { error: memberCreateError } = await supabase
      .from('workspace_members')
      .insert({
        workspace_id: newWorkspace.id,
        user_id: user.id,
        role: 'owner'
      })

    if (memberCreateError) {
      console.error('Error adding workspace member:', memberCreateError)
    }

    return NextResponse.json({
      workspace: newWorkspace,
      role: 'owner',
      created: true
    })
  } catch (error) {
    console.error('Error in GET /api/user/workspace:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
