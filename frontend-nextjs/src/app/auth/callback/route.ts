import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { WorkspaceInsert, WorkspaceMemberInsert } from '@/lib/supabase/types'

/**
 * OAuth callback handler
 * Exchanges the auth code for a session and creates/updates workspace
 *
 * Note: Workspace creation uses the admin client (service role) because:
 * 1. RLS policies on workspaces don't allow INSERT via anon key (by design)
 * 2. New users have no workspace yet, so they can't pass RLS checks
 * 3. This is a trusted server-side operation after OAuth validation
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const error_param = requestUrl.searchParams.get('error')
  const error_description = requestUrl.searchParams.get('error_description')
  const origin = requestUrl.origin
  const next = requestUrl.searchParams.get('next') ?? '/'

  // Log incoming request for debugging
  console.log('[Auth Callback] Received request:', {
    hasCode: !!code,
    error: error_param,
    error_description,
    url: request.url
  })

  // Handle OAuth errors from Supabase
  if (error_param) {
    console.error('[Auth Callback] OAuth error:', error_param, error_description)
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error_description || error_param)}`)
  }

  if (code) {
    const supabase = await createClient()

    // Exchange code for session
    console.log('[Auth Callback] Exchanging code for session...')
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error('[Auth Callback] Code exchange failed:', error.message, error)
    }

    if (!error && data.user) {
      console.log('[Auth Callback] Session created for user:', data.user.id)

      // Use admin client to bypass RLS for workspace operations
      // This is safe because we've already validated the user via OAuth
      const adminClient = createAdminClient()

      // Check if user has a workspace (using admin client to ensure we see all data)
      const { data: existingMember } = await adminClient
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', data.user.id)
        .single()

      // Create workspace if doesn't exist
      if (!existingMember) {
        console.log('[Auth Callback] Creating workspace for new user:', data.user.id)

        // Generate slug from email
        const email = data.user.email || 'user'
        const slug = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-')
        const name = data.user.user_metadata?.full_name || email.split('@')[0]

        // Create workspace using admin client (bypasses RLS)
        const workspaceData: WorkspaceInsert = {
          name: `${name}'s Workspace`,
          slug: `${slug}-${Date.now()}`
        }

        const { data: workspace, error: workspaceError } = await adminClient
          .from('workspaces')
          .insert(workspaceData as never)
          .select()
          .single()

        if (workspaceError) {
          console.error('[Auth Callback] Workspace creation failed:', workspaceError.message, workspaceError)
        } else if (workspace) {
          console.log('[Auth Callback] Workspace created:', (workspace as { id: string }).id)

          // Add user as workspace owner
          const memberData: WorkspaceMemberInsert = {
            workspace_id: (workspace as { id: string }).id,
            user_id: data.user.id,
            role: 'owner'
          }

          const { error: memberError } = await adminClient
            .from('workspace_members')
            .insert(memberData as never)

          if (memberError) {
            console.error('[Auth Callback] Member creation failed:', memberError.message, memberError)
          } else {
            console.log('[Auth Callback] User added as workspace owner')
          }
        }
      }

      // Redirect to the requested page with signup flag for new users
      const isNewUser = !existingMember
      const redirectUrl = new URL(`${origin}${next}`)
      if (isNewUser) {
        redirectUrl.searchParams.set('signup', 'true')
      }
      return NextResponse.redirect(redirectUrl.toString())
    }
  }

  // Return to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
