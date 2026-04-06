import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PUBLIC_EMAIL_DOMAINS } from '@/lib/utils/email-domains'
import { ACTIVE_WORKSPACE_COOKIE } from '@/lib/auth/constants'

/**
 * POST /api/workspace/create-personal
 *
 * Create a personal workspace for the current user.
 * Used when a user opts out of joining a domain-matched workspace.
 * Auth: authenticated user.
 *
 * Reuses the same workspace creation logic from the auth callback:
 * - Generates slug from email
 * - Creates workspace with "{name}'s Workspace"
 * - Adds user as owner
 * - Auto-detects website_url from email domain
 */
export async function POST() {
  try {
    const user = await getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const adminClient = createAdminClient()

    // Check if user already has a workspace (safety check)
    const { data: existingMember } = await adminClient
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (existingMember) {
      // User already has a workspace — fetch it and return
      const { data: workspace } = await adminClient
        .from('workspaces')
        .select('id, name')
        .eq('id', existingMember.workspace_id)
        .single()

      const response = NextResponse.json({
        workspaceId: existingMember.workspace_id,
        workspaceName: workspace?.name || '',
        alreadyExists: true,
      })

      response.cookies.set(ACTIVE_WORKSPACE_COOKIE, existingMember.workspace_id, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
        secure: process.env.NODE_ENV === 'production',
      })

      return response
    }

    // Generate workspace details from user info
    const email = user.email || 'user'
    const slug = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-')
    const name = user.user_metadata?.full_name || email.split('@')[0]

    // Create workspace
    const { data: workspace, error: workspaceError } = await adminClient
      .from('workspaces')
      .insert({
        name: `${name}'s Workspace`,
        slug: `${slug}-${Date.now()}`,
      })
      .select('id, name')
      .single()

    if (workspaceError || !workspace) {
      console.error('[Create Personal] Workspace creation failed:', workspaceError?.message)
      return NextResponse.json({ error: 'Failed to create workspace' }, { status: 500 })
    }

    // Auto-detect company domain from email for website_url
    const emailDomain = email.split('@')[1]?.toLowerCase()
    if (emailDomain && !PUBLIC_EMAIL_DOMAINS.has(emailDomain)) {
      await adminClient
        .from('workspaces')
        .update({ website_url: `https://${emailDomain}` } as never)
        .eq('id', workspace.id)
    }

    // Add user as workspace owner
    const { error: memberError } = await adminClient
      .from('workspace_members')
      .insert({
        workspace_id: workspace.id,
        user_id: user.id,
        role: 'owner',
      })

    if (memberError) {
      console.error('[Create Personal] Member creation failed:', memberError.message)
      // Clean up the orphaned workspace
      await adminClient.from('workspaces').delete().eq('id', workspace.id)
      return NextResponse.json({ error: 'Failed to set up workspace' }, { status: 500 })
    }

    // Set active workspace cookie
    const response = NextResponse.json({
      workspaceId: workspace.id,
      workspaceName: workspace.name,
    })

    response.cookies.set(ACTIVE_WORKSPACE_COOKIE, workspace.id, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
      secure: process.env.NODE_ENV === 'production',
    })

    return response
  } catch (err) {
    console.error('[Create Personal] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
