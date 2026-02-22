import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createModuleLogger } from '@/lib/utils/logger'

const log = createModuleLogger('[API][ScrapingResults][Detail]')

/**
 * GET /api/agent/data/scraping-results/[id]
 *
 * User-authenticated detail endpoint returning a single cache entry including
 * the full `content` JSONB field. Used when the user expands a row to preview
 * scraped markdown content.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  try {
    // RLS on agent_fetch_cache ensures the user can only read their workspace's entries.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table not in generated types yet
    const { data, error } = await (supabase as any)
      .from('agent_fetch_cache')
      .select('id, session_id, url, operation, content, content_size_bytes, created_at, updated_at')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      log.error(`Failed to fetch scraping result detail: ${error.message}`)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (e) {
    log.error(`Scraping result detail failed: ${e}`)
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
