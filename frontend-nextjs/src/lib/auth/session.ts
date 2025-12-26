'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export const SESSION_COOKIE_NAME = 'beton_session'

export interface SessionUser {
  sub: string
  email: string
  name: string
  workspace_id?: string
  workspace_name?: string
  role?: string
}

/**
 * Get the current session from cookie
 * Validates session with backend
 */
export async function getSession(): Promise<SessionUser | null> {
  const sessionCookie = cookies().get(SESSION_COOKIE_NAME)

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
