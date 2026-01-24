import { getSession } from '@/lib/auth/session'
import { NextResponse } from 'next/server'

/**
 * GET /api/session - Get current session
 * Used by client-side components to fetch user session
 */
export async function GET() {
  console.log('[API /session] Request received')
  try {
    const session = await getSession()

    if (!session) {
      console.log('[API /session] No session found, returning 401')
      return NextResponse.json(null, { status: 401 })
    }

    console.log('[API /session] Session found:', {
      sub: session.sub,
      email: session.email,
      workspace_id: session.workspace_id
    })
    return NextResponse.json(session)
  } catch (error) {
    console.error('[API /session] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch session' },
      { status: 500 }
    )
  }
}
