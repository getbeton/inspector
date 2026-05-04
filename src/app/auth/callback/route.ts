import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PUBLIC_EMAIL_DOMAINS } from '@/lib/utils/email-domains'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

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
  // Restrict `next` to a same-origin path. `new URL("https://app.com" + next)`
  // would happily resolve `next=@evil.com` to `https://app.com@evil.com`
  // (userinfo=app.com, host=evil.com) and redirect off-origin — open-redirect
  // bait for OAuth phishing pages. Allow only paths that begin with `/` and
  // do NOT begin with `//` or `/\` (which would also escape origin).
  const rawNext = requestUrl.searchParams.get('next')
  const next = rawNext && /^\/[^/\\]/.test(rawNext) ? rawNext : '/'

  // Handle OAuth errors from Supabase
  if (error_param) {
    console.error('[Auth Callback] OAuth error:', error_param, error_description)
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error_description || error_param)}`)
  }

  if (code) {
    const supabase = await createClient()

    // Exchange code for session
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error('[Auth Callback] Code exchange failed:', error.message)
      return NextResponse.redirect(`${origin}/login?error=auth_code_exchange_failed`)
    }

    if (data.user) {
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
        const email = data.user.email || 'user'
        const emailDomain = email.split('@')[1]?.toLowerCase()

        // Check if the user's email domain matches a claimed workspace domain
        if (emailDomain && !PUBLIC_EMAIL_DOMAINS.has(emailDomain)) {
          const { data: domainMatch } = await (adminClient as any)
            .from('workspace_domains')
            .select('workspace_id, domain')
            .eq('domain', emailDomain)
            .maybeSingle()

          if (domainMatch) {
            // Redirect to domain-based join suggestion page
            const joinUrl = new URL(`${origin}/join`)
            joinUrl.searchParams.set('workspace', domainMatch.workspace_id)
            joinUrl.searchParams.set('domain', domainMatch.domain)
            return NextResponse.redirect(joinUrl.toString())
          }
        }

        // No domain match found — create a personal workspace
        const slug = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-')
        const name = data.user.user_metadata?.full_name || email.split('@')[0]

        // Create workspace using admin client (bypasses RLS)
        const { data: workspace, error: workspaceError } = await adminClient
          .from('workspaces')
          .insert({
            name: `${name}'s Workspace`,
            slug: `${slug}-${Date.now()}`
          })
          .select('id')
          .single()

        if (workspaceError || !workspace) {
          console.error('[Auth Callback] Workspace creation failed:', workspaceError?.message)
          return NextResponse.redirect(`${origin}/login?error=workspace_creation_failed`)
        }

        // Auto-detect company domain from email for website_url
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
            user_id: data.user.id,
            role: 'owner'
          })

        if (memberError) {
          console.error('[Auth Callback] Member creation failed:', memberError.message)
          // Clean up the orphaned workspace
          await adminClient.from('workspaces').delete().eq('id', workspace.id)
          return NextResponse.redirect(`${origin}/login?error=workspace_setup_failed`)
        }
      }

      // Redirect to the requested page with signup flag for new users.
      // `next` is already validated to be a same-origin path (see top of
      // function); use the URL constructor's base-URL form to make the
      // origin authoritative regardless.
      const isNewUser = !existingMember
      const redirectUrl = new URL(next, origin)
      if (isNewUser) {
        redirectUrl.searchParams.set('signup', 'true')
      }
      return NextResponse.redirect(redirectUrl.toString())
    }
  }

  // Return to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
