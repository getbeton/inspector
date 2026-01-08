import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * OAuth callback handler
 * Exchanges the auth code for a session and creates/updates workspace
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const origin = requestUrl.origin
  const next = requestUrl.searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()

    // Exchange code for session
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      // Check if user has a workspace
      const { data: existingMember } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', data.user.id)
        .single()

      // Create workspace if doesn't exist
      if (!existingMember) {
        // Generate slug from email
        const email = data.user.email || 'user'
        const slug = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-')
        const name = data.user.user_metadata?.full_name || email.split('@')[0]

        // Create workspace
        const { data: workspace, error: workspaceError } = await supabase
          .from('workspaces')
          .insert({
            name: `${name}'s Workspace`,
            slug: `${slug}-${Date.now()}`
          })
          .select()
          .single()

        if (!workspaceError && workspace) {
          // Add user as workspace owner
          await supabase.from('workspace_members').insert({
            workspace_id: workspace.id,
            user_id: data.user.id,
            role: 'owner'
          })
        }
      }

      // Redirect to the requested page
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Return to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
