/**
 * POST /api/integrations/slack/disconnect
 *
 * Disconnects the Slack integration:
 * 1. Decrypts the bot token
 * 2. Calls auth.revoke to invalidate the token on Slack's side
 * 3. Deletes the integration_configs row
 *
 * If token revocation fails (e.g., token already revoked), we still
 * delete the local config — the goal is a clean disconnection.
 */

import { NextResponse } from 'next/server'
import { createClient, requireWorkspace } from '@/lib/supabase/server'
import { getIntegrationCredentials } from '@/lib/integrations/credentials'
import { createSlackClient, SlackAuthError } from '@/lib/integrations/slack/client'

export async function POST() {
  try {
    const { workspaceId } = await requireWorkspace()
    const supabase = await createClient()

    // Fetch current credentials
    const credentials = await getIntegrationCredentials(workspaceId, 'slack')

    // Revoke token on Slack's side (best-effort)
    if (credentials?.apiKey) {
      try {
        const client = createSlackClient({ botToken: credentials.apiKey })
        await client.revokeToken()
      } catch (error) {
        // Token may already be revoked — log but don't fail
        if (error instanceof SlackAuthError) {
          console.warn('[Slack] Token already revoked or invalid during disconnect')
        } else {
          console.warn('[Slack] Token revocation failed:', error)
        }
      }
    }

    // Delete the integration config row
    const { error } = await supabase
      .from('integration_configs')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('integration_name', 'slack')

    if (error) {
      console.error('[Slack] Failed to delete config:', error)
      return NextResponse.json({ error: 'Failed to disconnect Slack' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    console.error('[Slack] Disconnect error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
