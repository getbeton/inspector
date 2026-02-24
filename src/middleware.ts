import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Skip middleware entirely for auth callback - let the route handler manage the full PKCE flow
  // This is critical: the callback needs to exchange the code BEFORE any other auth operations
  if (pathname === '/auth/callback') {
    return NextResponse.next()
  }

  // Skip middleware for MCP endpoints — they manage auth internally
  // /mcp = Streamable HTTP endpoint, /api/mcp/* = OAuth flow
  // /.well-known/* = OAuth metadata (original path before Next.js rewrite)
  // /api/well-known/* = OAuth metadata (post-rewrite destination)
  if (
    pathname === '/mcp' ||
    pathname.startsWith('/api/mcp/') ||
    pathname.startsWith('/.well-known/') ||
    pathname.startsWith('/api/well-known/')
  ) {
    return NextResponse.next()
  }

  // Guard: return a friendly error page when Supabase is not configured
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return new NextResponse(
      '<html><body style="font-family:system-ui;padding:2rem"><h1>Configuration Error</h1><p>Supabase is not configured. Check your env vars and redeploy.</p><code>NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.</code></body></html>',
      { status: 503, headers: { 'content-type': 'text/html' } }
    )
  }

  // Skip all auth checks when AUTH_BYPASS is "true"
  if (process.env.AUTH_BYPASS === 'true') {
    return NextResponse.next()
  }

  // Create a response that we can modify
  let response = NextResponse.next({
    request: {
      headers: request.headers
    }
  })

  // Create Supabase client with cookie handling
  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({
            request
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        }
      }
    }
  )

  // Refresh session if expired - important for Server Components
  const {
    data: { user }
  } = await supabase.auth.getUser()

  // Redirect if accessing login while authenticated
  if (pathname === '/login' && user) {
    // If `next` is set (e.g. MCP OAuth flow), honor it instead of going to /
    const next = request.nextUrl.searchParams.get('next')
    const target = next || '/'
    return NextResponse.redirect(new URL(target, request.url))
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'
  ]
}
