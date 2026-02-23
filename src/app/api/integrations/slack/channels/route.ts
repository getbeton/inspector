/**
 * GET /api/integrations/slack/channels
 *
 * Returns all non-archived channels the Slack bot can see.
 * Sorted alphabetically. Requires Slack integration to be connected.
 */

import { NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/supabase/server'
import { getIntegrationCredentials } from '@/lib/integrations/credentials'
import { createSlackClient, SlackAuthError } from '@/lib/integrations/slack/client'

export async function GET() {
  try {
    const { workspaceId } = await requireWorkspace()

    const credentials = await getIntegrationCredentials(workspaceId, 'slack')
    if (!credentials || !credentials.isActive || credentials.status !== 'connected') {
      return NextResponse.json(
        { error: 'Slack is not connected. Please install the Slack app first.' },
        { status: 400 }
      )
    }

    const client = createSlackClient({ botToken: credentials.apiKey })
    const channels = await client.listAllChannels({ excludeArchived: true })

    return NextResponse.json({
      channels: channels.map((ch) => ({
        id: ch.id,
        name: ch.name,
        is_private: ch.is_private,
        num_members: ch.num_members,
      })),
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    if (error instanceof SlackAuthError) {
      return NextResponse.json(
        { error: 'Slack token is invalid or revoked. Please reconnect.', code: 'token_revoked' },
        { status: 401 }
      )
    }
    console.error('[Slack] Channel list error:', error)
    return NextResponse.json({ error: 'Failed to fetch channels' }, { status: 500 })
  }
}
