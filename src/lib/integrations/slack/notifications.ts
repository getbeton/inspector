/**
 * Slack signal notification dispatcher
 *
 * Hooks into the signal processing pipeline to send Block Kit
 * notifications when signals are detected. This module is designed
 * to be NON-BLOCKING — it catches all errors and logs them, and
 * must NEVER cause the signal pipeline to fail.
 *
 * Flow:
 * 1. Check if workspace has Slack connected + signal type enabled
 * 2. Fetch account context (name, domain, health_score)
 * 3. Resolve smart links (PostHog, Attio)
 * 4. Build Block Kit message
 * 5. Send via Slack API
 */

import { decryptCredentials, isEncrypted } from '@/lib/crypto/encryption'
import { createSlackClient, SlackAuthError, SlackChannelError } from './client'
import { buildSignalNotificationMessage } from './message-builder'
import type { SignalNotificationContext } from './message-builder'
import type { SlackConfigJson } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = import('@supabase/supabase-js').SupabaseClient<any, any, any>

interface DispatchableSignal {
  account_id: string
  workspace_id: string
  type: string
  value: number | null
  details: Record<string, unknown>
  source: string
  id?: string
}

// ── Main Dispatcher ─────────────────────────────────────────────

/**
 * Check if workspace has Slack configured and enabled for this signal type,
 * then build and send the Block Kit notification.
 *
 * This function is NON-BLOCKING — it catches all errors and logs them.
 * It must NEVER cause the signal processing pipeline to fail.
 */
export async function dispatchSlackNotification(
  supabase: AnySupabaseClient,
  signal: DispatchableSignal,
  workspaceId: string
): Promise<void> {
  try {
    // ── 1. Fetch Slack config ─────────────────────────────────
    const { data: configRow } = await supabase
      .from('integration_configs')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('integration_name', 'slack')
      .eq('status', 'connected')
      .eq('is_active', true)
      .single()

    if (!configRow) return // Slack not connected — skip silently

    const config = configRow as {
      api_key_encrypted: string
      project_id_encrypted: string | null
      config_json: unknown
    }

    const configJson = (config.config_json || {}) as SlackConfigJson

    // ── 2. Check signal type enabled ──────────────────────────
    if (configJson.enabled_signal_types && configJson.enabled_signal_types.length > 0) {
      if (!configJson.enabled_signal_types.includes(signal.type)) {
        return // Signal type disabled — skip silently
      }
    }

    // ── 3. Check channel configured ─────────────────────────
    if (!configJson.slack_channel_id) {
      return // No channel selected — skip silently
    }

    // ── 4. Fetch account context ─────────────────────────────
    const { data: account } = await supabase
      .from('accounts')
      .select('id, name, domain, health_score')
      .eq('id', signal.account_id)
      .eq('workspace_id', workspaceId)
      .single()

    if (!account) {
      console.warn(`[Slack] Account ${signal.account_id} not found, skipping notification`)
      return
    }

    // ── 5. Fetch workspace slug ──────────────────────────────
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('slug')
      .eq('id', workspaceId)
      .single()

    // ── 6. Resolve smart links ───────────────────────────────
    const smartLinks = await resolveSmartLinks(supabase, workspaceId, account as { domain: string | null })

    // ── 7. Build notification context ────────────────────────
    const ctx: SignalNotificationContext = {
      signal: {
        id: signal.id || '',
        type: signal.type,
        value: signal.value,
        details: signal.details,
        source: signal.source,
        timestamp: new Date().toISOString(),
      },
      account: {
        id: account.id as string,
        name: (account.name as string) || 'Unknown Account',
        domain: (account.domain as string) || null,
        health_score: (account.health_score as number) ?? null,
      },
      workspace: {
        slug: (workspace?.slug as string) || '',
      },
      ...smartLinks,
    }

    // ── 8. Build message ─────────────────────────────────────
    const { blocks, text } = buildSignalNotificationMessage(ctx)

    // ── 9. Decrypt token and send ────────────────────────────
    let botToken: string
    if (isEncrypted(config.api_key_encrypted)) {
      const decrypted = await decryptCredentials({
        apiKeyEncrypted: config.api_key_encrypted,
        projectIdEncrypted: config.project_id_encrypted,
      })
      botToken = decrypted.apiKey
    } else {
      botToken = config.api_key_encrypted
    }

    const client = createSlackClient({ botToken })
    await client.postMessage(configJson.slack_channel_id, blocks, text)
  } catch (error) {
    await handleDispatchError(supabase, workspaceId, error)
  }
}

// ── Batch Pre-check ─────────────────────────────────────────────

/**
 * Pre-check that a workspace's Slack token is valid before processing
 * a batch of signals. Returns false if the token is dead (marks status='error').
 *
 * Used by the cron job to avoid N repeated auth failures per workspace.
 */
export async function preCheckSlackToken(
  supabase: AnySupabaseClient,
  workspaceId: string
): Promise<boolean> {
  try {
    const { data: configRow } = await supabase
      .from('integration_configs')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('integration_name', 'slack')
      .eq('status', 'connected')
      .eq('is_active', true)
      .single()

    if (!configRow) return false

    const config = configRow as {
      api_key_encrypted: string
      project_id_encrypted: string | null
    }

    let botToken: string
    if (isEncrypted(config.api_key_encrypted)) {
      const decrypted = await decryptCredentials({
        apiKeyEncrypted: config.api_key_encrypted,
        projectIdEncrypted: config.project_id_encrypted,
      })
      botToken = decrypted.apiKey
    } else {
      botToken = config.api_key_encrypted
    }

    const client = createSlackClient({ botToken })
    await client.testConnection()
    return true
  } catch (error) {
    if (error instanceof SlackAuthError) {
      console.error(`[Slack] Token invalid for workspace ${workspaceId}, marking as error`)
      await supabase
        .from('integration_configs')
        .update({ status: 'error' } as never)
        .eq('workspace_id', workspaceId)
        .eq('integration_name', 'slack')
    }
    return false
  }
}

// ── Smart Link Resolution ───────────────────────────────────────

async function resolveSmartLinks(
  supabase: AnySupabaseClient,
  workspaceId: string,
  account: { domain: string | null }
): Promise<Pick<SignalNotificationContext, 'posthog' | 'attio'>> {
  const result: Pick<SignalNotificationContext, 'posthog' | 'attio'> = {}

  // Run PostHog and Attio config lookups in parallel
  const [phConfig, attioConfig] = await Promise.all([
    supabase
      .from('integration_configs')
      .select('config_json')
      .eq('workspace_id', workspaceId)
      .eq('integration_name', 'posthog')
      .eq('status', 'connected')
      .eq('is_active', true)
      .single(),
    supabase
      .from('integration_configs')
      .select('config_json')
      .eq('workspace_id', workspaceId)
      .eq('integration_name', 'attio')
      .eq('status', 'connected')
      .eq('is_active', true)
      .single(),
  ])

  // PostHog: build context for smart links
  if (phConfig.data?.config_json) {
    const phJson = phConfig.data.config_json as Record<string, unknown>
    const host = (phJson.host as string) || (phJson.base_url as string)
    const projectId = (phJson.project_id as string) || (phJson.posthog_project_id as string)

    if (host && projectId) {
      result.posthog = {
        host,
        projectId,
        distinctId: account.domain || undefined,
      }
    }
  }

  // Attio: build context for smart links
  if (attioConfig.data?.config_json) {
    result.attio = {
      domain: account.domain || undefined,
    }
  }

  return result
}

// ── Error Handling ──────────────────────────────────────────────

async function handleDispatchError(
  supabase: AnySupabaseClient,
  workspaceId: string,
  error: unknown
): Promise<void> {
  if (error instanceof SlackAuthError) {
    // Token revoked or invalid — mark integration as error
    console.error(`[Slack] Auth error for workspace ${workspaceId}: ${error.message}`)
    try {
      await supabase
        .from('integration_configs')
        .update({ status: 'error' } as never)
        .eq('workspace_id', workspaceId)
        .eq('integration_name', 'slack')
    } catch (dbError) {
      console.error('[Slack] Failed to update integration status:', dbError)
    }
    return
  }

  if (error instanceof SlackChannelError) {
    // Channel issue — log warning but don't change status
    console.warn(`[Slack] Channel error for workspace ${workspaceId}: ${error.message}`)
    return
  }

  // All other errors — log and swallow
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[Slack] Notification dispatch error for workspace ${workspaceId}: ${message}`)
}
