import { NextRequest, NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/supabase/server'
import { getIntegrationCredentials } from '@/lib/integrations/credentials'
import { getObjectAttributes } from '@/lib/integrations/attio/client'

/**
 * GET /api/integrations/attio/attributes?object=companies
 *
 * Lists attributes for a given Attio object.
 * Requires Attio integration to be configured.
 */
export async function GET(request: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace()
    const objectSlug = request.nextUrl.searchParams.get('object')

    if (!objectSlug) {
      return NextResponse.json({ error: 'Missing object query parameter' }, { status: 400 })
    }

    const creds = await getIntegrationCredentials(workspaceId, 'attio')
    if (!creds?.apiKey) {
      return NextResponse.json({ error: 'Attio not configured' }, { status: 400 })
    }

    const attributes = await getObjectAttributes(creds.apiKey, objectSlug)

    return NextResponse.json({ attributes })
  } catch (err) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    if (err instanceof Error && err.message.includes('No workspace')) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }
    console.error('[Attio Attributes] Error:', err)
    return NextResponse.json({ error: 'Failed to fetch Attio attributes' }, { status: 500 })
  }
}
