/**
 * Slack integration types
 */

// ── API Response Types ──────────────────────────────────────────

export interface SlackApiResponse {
  ok: boolean
  error?: string
  response_metadata?: { next_cursor?: string }
}

export interface SlackAuthTestResponse extends SlackApiResponse {
  url?: string
  team?: string
  user?: string
  team_id?: string
  user_id?: string
  bot_id?: string
  is_enterprise_install?: boolean
}

export interface SlackPostMessageResponse extends SlackApiResponse {
  channel?: string
  ts?: string
  message?: {
    text?: string
    ts?: string
  }
}

export interface SlackConversationsListResponse extends SlackApiResponse {
  channels?: SlackChannel[]
}

// ── Domain Types ────────────────────────────────────────────────

export interface SlackChannel {
  id: string
  name: string
  is_private: boolean
  is_archived: boolean
  num_members?: number
  topic?: { value: string }
  purpose?: { value: string }
}

export interface SlackConnectionResult {
  valid: boolean
  teamId?: string
  teamName?: string
  botUserId?: string
  url?: string
}

export interface SlackPostResult {
  channelId: string
  timestamp: string
}

// ── Config Types ────────────────────────────────────────────────

export interface SlackClientConfig {
  botToken: string
}

/**
 * Shape of config_json stored in integration_configs for Slack.
 * All fields optional because they're populated progressively (OAuth → channel selection).
 */
export interface SlackConfigJson {
  slack_team_id?: string
  slack_team_name?: string
  slack_bot_user_id?: string
  slack_channel_id?: string
  slack_channel_name?: string
  installed_by_slack_user_id?: string
  enabled_signal_types?: string[]
}
