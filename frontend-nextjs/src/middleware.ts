import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Routes that don't require authentication
const publicRoutes = ['/login', '/auth/callback', '/api/health']

// Routes that require authentication
const protectedRoutes = ['/signals', '/playbooks', '/settings', '/identities', '/backtest']

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Skip middleware entirely for auth callback - let the route handler manage the full PKCE flow
  // This is critical: the callback needs to exchange the code BEFORE any other auth operations
  if (pathname === '/auth/callback') {
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
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  // Check if route is protected
  const isProtected = protectedRoutes.some((route) => pathname.startsWith(route))

  // Check if route is public
  const isPublic = publicRoutes.some((route) => pathname.startsWith(route))

  // Home page requires authentication
  const isHome = pathname === '/'

  // Redirect to login if accessing protected route without auth
  if ((isProtected || isHome) && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Redirect to home if accessing login while authenticated
  if (pathname === '/login' && user) {
    return NextResponse.redirect(new URL('/', request.url))
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
