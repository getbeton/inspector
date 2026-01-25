import { getSession } from '@/lib/auth/session'
import { NextResponse } from 'next/server'

/**
 * GET /api/session - Get current session
 * Used by client-side components to fetch user session
 */
export async function GET() {
  try {
    const session = await getSession()

    if (!session) {
      return NextResponse.json(null, { status: 401 })
    }

    return NextResponse.json(session)
  } catch (error) {
    console.error('[API /session] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch session' },
      { status: 500 }
    )
  }
}
