import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const SESSION_COOKIE_NAME = 'beton_session'

// Routes that don't require authentication
const publicRoutes = ['/login', '/api/health']

// Routes that require authentication
const protectedRoutes = ['/signals', '/playbooks', '/settings', '/identities', '/backtest']

export function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)
  const pathname = request.nextUrl.pathname

  // Check if route is protected
  const isProtected = protectedRoutes.some(route => pathname.startsWith(route))

  // Check if route is public
  const isPublic = publicRoutes.some(route => pathname.startsWith(route))

  // Home page requires authentication
  const isHome = pathname === '/'

  if (isProtected || isHome) {
    if (!sessionCookie) {
      // Redirect to login if no session
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  if (isPublic && pathname !== '/api/health') {
    if (sessionCookie) {
      // Already logged in, redirect to home
      // (optional - you might want to allow access to login even when authenticated)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)'
  ]
}
