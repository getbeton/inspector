import { NextRequest, NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/supabase/server'
import { getIntegrationCredentials } from '@/lib/integrations/credentials'
import { searchRecords } from '@/lib/integrations/attio/client'

/**
 * GET /api/integrations/attio/search?q=<query>&object=people|companies
 *
 * Searches Attio records by name (or email for people).
 * Returns simplified results for the setup wizard contact picker.
 *
 * Query heuristic: if the query contains "@", search by email_addresses;
 * otherwise search by name. Both use the $contains operator.
 */
export async function GET(request: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace()

    const q = request.nextUrl.searchParams.get('q')
    const objectSlug = request.nextUrl.searchParams.get('object') || 'people'

    if (!q || q.length < 2) {
      return NextResponse.json({ results: [] })
    }

    if (!['people', 'companies'].includes(objectSlug)) {
      return NextResponse.json({ error: 'Invalid object type' }, { status: 400 })
    }

    const creds = await getIntegrationCredentials(workspaceId, 'attio')
    if (!creds?.apiKey) {
      return NextResponse.json({ error: 'Attio not configured' }, { status: 400 })
    }

    // Decide which attribute to search based on query shape
    const isEmailQuery = q.includes('@')
    const filterAttribute =
      objectSlug === 'people' && isEmailQuery ? 'email_addresses' : 'name'

    const records = await searchRecords(
      creds.apiKey,
      objectSlug,
      filterAttribute,
      { $contains: q },
      10
    )

    // Extract display-friendly fields from Attio's nested values structure
    const results = records.map((record) => {
      const values = record.values as Record<string, Array<Record<string, unknown>>>

      if (objectSlug === 'people') {
        const nameEntry = values.name?.[0]
        const emailEntry = values.email_addresses?.[0]
        return {
          id: record.id,
          name:
            (nameEntry?.full_name as string) ||
            `${(nameEntry?.first_name as string) || ''} ${(nameEntry?.last_name as string) || ''}`.trim() ||
            'Unknown',
          email: (emailEntry?.email_address as string) || null,
        }
      }

      // companies
      const nameEntry = values.name?.[0]
      const domainEntry = values.domains?.[0]
      return {
        id: record.id,
        name: (nameEntry?.value as string) || 'Unknown',
        domain: (domainEntry?.domain as string) || null,
      }
    })

    return NextResponse.json({ results })
  } catch (err) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    if (err instanceof Error && err.message.includes('No workspace')) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }
    console.error('[Attio Search] Error:', err)
    return NextResponse.json({ error: 'Failed to search Attio records' }, { status: 500 })
  }
}
