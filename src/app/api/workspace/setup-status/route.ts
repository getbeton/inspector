/**
 * GET /api/workspace/setup-status
 *
 * Returns the current workspace's setup completion status.
 * Used by the dashboard to determine whether to show the setup wizard
 * or redirect to the signals page.
 *
 * Response:
 * {
 *   "setupComplete": boolean,
 *   "integrations": {
 *     "posthog": boolean,
 *     "attio": boolean
 *   },
 *   "billing": {
 *     "required": boolean,
 *     "configured": boolean,
 *     "status": "active" | "card_required" | "free" | null
 *   }
 * }
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceMembership } from '@/lib/supabase/helpers'
import { computeSetupStatus } from '@/lib/setup/status'

export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const membership = await getWorkspaceMembership()
    if (!membership) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    const status = await computeSetupStatus(membership.workspaceId)
    return NextResponse.json(status)
  } catch (error) {
    console.error('Error in GET /api/workspace/setup-status:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
