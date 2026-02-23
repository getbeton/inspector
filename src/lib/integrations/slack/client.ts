/**
 * Slack Web API Client
 *
 * Provides functionality for:
 * - Posting Block Kit messages to channels
 * - Listing channels the bot can see
 * - Connection validation (auth.test)
 * - Token revocation
 *
 * Uses plain fetch — no external Slack SDK dependency.
 * Rate limiting: respects Retry-After header with up to 3 retries.
 */

import type {
  SlackApiResponse,
  SlackAuthTestResponse,
  SlackPostMessageResponse,
  SlackConversationsListResponse,
  SlackChannel,
  SlackClientConfig,
  SlackConnectionResult,
  SlackPostResult,
} from './types'

const SLACK_API_BASE = 'https://slack.com/api'

const MAX_RETRIES = 3
const RETRY_DELAYS = [1000, 2000, 4000] // Exponential: 1s, 2s, 4s

// ── Error Types ─────────────────────────────────────────────────

export class SlackError extends Error {
  slackErrorCode?: string

  constructor(message: string, code?: string) {
    super(message)
    this.name = 'SlackError'
    this.slackErrorCode = code
  }
}

export class SlackAuthError extends SlackError {
  constructor(message: string, code?: string) {
    super(message, code)
    this.name = 'SlackAuthError'
  }
}

export class SlackRateLimitError extends SlackError {
  retryAfter: number

  constructor(message: string, retryAfter: number = 60) {
    super(message, 'ratelimited')
    this.name = 'SlackRateLimitError'
    this.retryAfter = retryAfter
  }
}

export class SlackChannelError extends SlackError {
  constructor(message: string, code?: string) {
    super(message, code)
    this.name = 'SlackChannelError'
  }
}

// ── Error Code → User Message Mapping ───────────────────────────

type SlackErrorFactory = (message: string, code: string) => SlackError

const SLACK_ERROR_FACTORIES: Record<string, { message: string; create: SlackErrorFactory }> = {
  token_revoked: { message: 'Slack token has been revoked. Please reconnect.', create: (m, c) => new SlackAuthError(m, c) },
  account_inactive: { message: 'Slack workspace account is inactive.', create: (m, c) => new SlackAuthError(m, c) },
  invalid_auth: { message: 'Invalid Slack authentication. Please reconnect.', create: (m, c) => new SlackAuthError(m, c) },
  not_authed: { message: 'No Slack authentication provided.', create: (m, c) => new SlackAuthError(m, c) },
  channel_not_found: { message: 'Slack channel not found. It may have been deleted.', create: (m, c) => new SlackChannelError(m, c) },
  not_in_channel: { message: 'Bot is not in this channel. Invite the bot first.', create: (m, c) => new SlackChannelError(m, c) },
  is_archived: { message: 'Channel is archived and cannot receive messages.', create: (m, c) => new SlackChannelError(m, c) },
  ratelimited: { message: 'Slack rate limit exceeded. Will retry.', create: (m) => new SlackRateLimitError(m) },
}

// ── Client ──────────────────────────────────────────────────────

export class SlackClient {
  private botToken: string

  constructor(config: SlackClientConfig) {
    if (!config.botToken) {
      throw new SlackError('Slack bot token is required')
    }
    this.botToken = config.botToken
  }

  /**
   * Call a Slack Web API method with automatic rate-limit retry.
   */
  private async call<T extends SlackApiResponse>(
    method: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    let lastError: unknown

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const response = await fetch(`${SLACK_API_BASE}/${method}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.botToken}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })

      // HTTP 429 — respect Retry-After header
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '1', 10)
        if (attempt < MAX_RETRIES) {
          await sleep(retryAfter * 1000)
          continue
        }
        throw new SlackRateLimitError('Rate limit exceeded after max retries', retryAfter)
      }

      // Non-200 HTTP status (network issues, Slack outage)
      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText)
        lastError = new SlackError(`Slack API HTTP ${response.status}: ${errorText}`)
        if (attempt < MAX_RETRIES && response.status >= 500) {
          await sleep(RETRY_DELAYS[attempt] ?? 4000)
          continue
        }
        throw lastError
      }

      // Parse JSON
      const data = (await response.json()) as T

      // Slack returns { ok: false, error: "..." } for application-level errors
      if (!data.ok) {
        const errorCode = data.error || 'unknown_error'
        const factory = SLACK_ERROR_FACTORIES[errorCode]

        if (factory) {
          // Special case: ratelimited in body (rare, but handle it)
          if (errorCode === 'ratelimited' && attempt < MAX_RETRIES) {
            await sleep(RETRY_DELAYS[attempt] ?? 4000)
            continue
          }
          throw factory.create(factory.message, errorCode)
        }

        throw new SlackError(`Slack API error: ${errorCode}`, errorCode)
      }

      return data
    }

    // Should not reach here, but satisfy TypeScript
    throw lastError ?? new SlackError('Unexpected retry exhaustion')
  }

  /**
   * Validate the bot token by calling auth.test.
   * Returns workspace metadata on success.
   */
  async testConnection(): Promise<SlackConnectionResult> {
    const data = await this.call<SlackAuthTestResponse>('auth.test')
    return {
      valid: true,
      teamId: data.team_id,
      teamName: data.team,
      botUserId: data.user_id,
      url: data.url,
    }
  }

  /**
   * Revoke the bot token. After this call, the token is permanently invalidated.
   */
  async revokeToken(): Promise<void> {
    await this.call('auth.revoke')
  }

  /**
   * Post a Block Kit message to a channel.
   */
  async postMessage(
    channelId: string,
    blocks: unknown[],
    text: string
  ): Promise<SlackPostResult> {
    const data = await this.call<SlackPostMessageResponse>('chat.postMessage', {
      channel: channelId,
      blocks,
      text, // Fallback for notifications / accessibility
    })

    return {
      channelId: data.channel || channelId,
      timestamp: data.ts || data.message?.ts || '',
    }
  }

  /**
   * List channels the bot can see (single page).
   * For all channels, use listAllChannels().
   */
  async listChannels(options?: {
    cursor?: string
    limit?: number
    excludeArchived?: boolean
    types?: string
  }): Promise<{ channels: SlackChannel[]; nextCursor?: string }> {
    const data = await this.call<SlackConversationsListResponse>('conversations.list', {
      cursor: options?.cursor,
      limit: options?.limit ?? 200,
      exclude_archived: options?.excludeArchived ?? true,
      types: options?.types ?? 'public_channel,private_channel',
    })

    return {
      channels: (data.channels || []).map(normalizeChannel),
      nextCursor: data.response_metadata?.next_cursor || undefined,
    }
  }

  /**
   * Paginate through all channels the bot can see.
   */
  async listAllChannels(options?: {
    excludeArchived?: boolean
    types?: string
  }): Promise<SlackChannel[]> {
    const allChannels: SlackChannel[] = []
    let cursor: string | undefined

    do {
      const page = await this.listChannels({
        cursor,
        limit: 200,
        excludeArchived: options?.excludeArchived ?? true,
        types: options?.types,
      })
      allChannels.push(...page.channels)
      cursor = page.nextCursor
    } while (cursor)

    // Sort alphabetically by name
    return allChannels.sort((a, b) => a.name.localeCompare(b.name))
  }
}

// ── Helpers ─────────────────────────────────────────────────────

function normalizeChannel(ch: SlackChannel): SlackChannel {
  return {
    id: ch.id,
    name: ch.name,
    is_private: ch.is_private,
    is_archived: ch.is_archived,
    num_members: ch.num_members,
    topic: ch.topic,
    purpose: ch.purpose,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── Factory ─────────────────────────────────────────────────────

export function createSlackClient(config: SlackClientConfig): SlackClient {
  return new SlackClient(config)
}
