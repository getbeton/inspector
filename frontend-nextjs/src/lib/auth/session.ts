import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE_NAME, type SessionUser } from './constants'

// Re-export for convenience
export { SESSION_COOKIE_NAME, type SessionUser } from './constants'

/**
 * Get the current session from cookie
 * Validates session with backend
 */
export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)

  if (!sessionCookie) {
    return null
  }

  try {
    const response = await fetch(
      `${process.env.API_URL || 'http://localhost:8000'}/api/auth/me`,
      {
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${sessionCookie.value}`
        }
      }
    )

    if (!response.ok) {
      return null
    }

    const user = await response.json()
    return user
  } catch (error) {
    console.error('Failed to validate session:', error)
    return null
  }
}

/**
 * Require authentication - redirect to login if not authenticated
 */
export async function requireAuth(): Promise<SessionUser> {
  const session = await getSession()

  if (!session) {
    redirect('/login')
  }

  return session
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession()
  return session !== null
}
