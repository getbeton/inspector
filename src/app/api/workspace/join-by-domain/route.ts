import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ACTIVE_WORKSPACE_COOKIE } from '@/lib/auth/constants'

/**
 * GET /api/workspace/join-by-domain?workspaceId=<uuid>
 *
 * Fetch workspace info for the domain-based join suggestion page.
 * Auth: authenticated user.
 * Returns workspace name so the join page can display it.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const workspaceId = request.nextUrl.searchParams.get('workspaceId')

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    const { data: workspace, error } = await adminClient
      .from('workspaces')
      .select('id, name, slug')
      .eq('id', workspaceId)
      .single()

    if (error || !workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }

    return NextResponse.json({
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      workspaceSlug: workspace.slug,
    })
  } catch (err) {
    console.error('[Join By Domain GET] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/workspace/join-by-domain
 *
 * Join a workspace by matching email domain to a claimed workspace domain.
 * Auth: authenticated user.
 * Body: { workspaceId: string, domain: string }
 *
 * Verifications:
 * - The domain is claimed by the specified workspace in workspace_domains
 * - The user's email domain matches the claimed domain
 * - Handles duplicate membership gracefully (returns success if already a member)
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json()
    const { workspaceId, domain } = body

    if (!workspaceId || typeof workspaceId !== 'string') {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
    }

    if (!domain || typeof domain !== 'string') {
      return NextResponse.json({ error: 'domain is required' }, { status: 400 })
    }

    const normalizedDomain = domain.trim().toLowerCase()

    // Verify the user's email domain matches
    const userEmail = user.email
    if (!userEmail) {
      return NextResponse.json({ error: 'User email not available' }, { status: 400 })
    }

    const userDomain = userEmail.split('@')[1]?.toLowerCase()
    if (userDomain !== normalizedDomain) {
      return NextResponse.json(
        { error: 'Your email domain does not match the workspace domain' },
        { status: 403 }
      )
    }

    const adminClient = createAdminClient()

    // Verify the domain is claimed by this workspace
    const { data: domainClaim, error: domainError } = await (adminClient as any)
      .from('workspace_domains')
      .select('id, workspace_id, domain')
      .eq('workspace_id', workspaceId)
      .eq('domain', normalizedDomain)
      .maybeSingle()

    if (domainError) {
      console.error('[Join By Domain] Domain check failed:', domainError)
      return NextResponse.json({ error: 'Failed to verify domain' }, { status: 500 })
    }

    if (!domainClaim) {
      return NextResponse.json(
        { error: 'Domain is not claimed by this workspace' },
        { status: 403 }
      )
    }

    // Check if user is already a member (handle gracefully)
    const { data: existingMember } = await adminClient
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .eq('workspace_id', workspaceId)
      .maybeSingle()

    if (existingMember) {
      // Already a member — fetch workspace name and return success
      const { data: workspace } = await adminClient
        .from('workspaces')
        .select('id, name')
        .eq('id', workspaceId)
        .single()

      const response = NextResponse.json({
        workspaceId,
        workspaceName: workspace?.name || '',
        alreadyMember: true,
      })

      response.cookies.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
        secure: process.env.NODE_ENV === 'production',
      })

      return response
    }

    // Add user as member
    const { error: insertError } = await adminClient
      .from('workspace_members')
      .insert({
        workspace_id: workspaceId,
        user_id: user.id,
        role: 'member',
      })

    if (insertError) {
      console.error('[Join By Domain] Failed to add member:', insertError)
      return NextResponse.json({ error: 'Failed to join workspace' }, { status: 500 })
    }

    // Fetch workspace name for the response
    const { data: workspace } = await adminClient
      .from('workspaces')
      .select('id, name')
      .eq('id', workspaceId)
      .single()

    // Set active workspace cookie
    const response = NextResponse.json({
      workspaceId,
      workspaceName: workspace?.name || '',
    })

    response.cookies.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
      secure: process.env.NODE_ENV === 'production',
    })

    return response
  } catch (err) {
    console.error('[Join By Domain POST] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
