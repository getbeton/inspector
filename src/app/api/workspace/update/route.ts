import { NextRequest, NextResponse } from 'next/server'
import { createClient, requireWorkspace } from '@/lib/supabase/server'

/**
 * PATCH /api/workspace/update
 *
 * Updates workspace fields. Currently supports:
 * - website_url: Company website URL
 */
export async function PATCH(request: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace()
    const body = await request.json()
    const supabase = await createClient()

    const allowedFields: Record<string, unknown> = {}

    if ('website_url' in body && typeof body.website_url === 'string') {
      allowedFields.website_url = body.website_url || null
    }

    if (Object.keys(allowedFields).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { error } = await supabase
      .from('workspaces')
      .update(allowedFields as never)
      .eq('id', workspaceId)

    if (error) {
      console.error('[Workspace Update] Failed:', error)
      return NextResponse.json({ error: 'Failed to update workspace' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    if (err instanceof Error && err.message.includes('No workspace')) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
