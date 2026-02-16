import { NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/supabase/server'
import { getIntegrationCredentials } from '@/lib/integrations/credentials'
import { discoverObjects } from '@/lib/integrations/attio/client'

/**
 * GET /api/integrations/attio/objects
 *
 * Discovers all objects in the user's Attio workspace.
 * Requires Attio integration to be configured.
 */
export async function GET() {
  try {
    const { workspaceId } = await requireWorkspace()

    const creds = await getIntegrationCredentials(workspaceId, 'attio')
    if (!creds?.apiKey) {
      return NextResponse.json({ error: 'Attio not configured' }, { status: 400 })
    }

    const objects = await discoverObjects(creds.apiKey)

    return NextResponse.json({ objects })
  } catch (err) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    if (err instanceof Error && err.message.includes('No workspace')) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }
    console.error('[Attio Objects] Error:', err)
    return NextResponse.json({ error: 'Failed to fetch Attio objects' }, { status: 500 })
  }
}
