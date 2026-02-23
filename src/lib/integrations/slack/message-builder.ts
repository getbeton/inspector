/**
 * Slack Block Kit message builder for signal notifications
 *
 * Transforms a SignalNotificationContext into rich Block Kit messages
 * with smart URL buttons that link to Beton, PostHog, and Attio.
 *
 * Message structure:
 * ┌─────────────────────────────────────────┐
 * │  🚨 Signal: Usage Spike                 │  ← Header
 * ├─────────────────────────────────────────┤
 * │  Account  │ Acme Corp                   │  ← Fields
 * │  Signal   │ M75 (Good Quality)          │
 * │  Health   │ 82/100                      │
 * │  Category │ Expansion                   │
 * ├─────────────────────────────────────────┤
 * │  3 new users activated Analytics…       │  ← Details
 * ├─────────────────────────────────────────┤
 * │  [View in Beton] [PostHog] [Attio]      │  ← Action buttons
 * ├─────────────────────────────────────────┤
 * │  📅 Feb 23, 2026 • via signal-detection │  ← Context
 * └─────────────────────────────────────────┘
 */

import { getConcreteGrade, getGradeLabel } from '@/lib/heuristics/concrete-grades'
import { getAppBaseUrl } from './oauth'

// ── Signal Type Metadata ────────────────────────────────────────

export interface SignalTypeMeta {
  displayName: string
  emoji: string
  category: 'expansion' | 'churn_risk'
}

/**
 * Shared metadata for all 20 signal types.
 * Used by the message builder, Settings UI, and analytics.
 */
export const SIGNAL_TYPE_METADATA: Record<string, SignalTypeMeta> = {
  // Expansion signals (12)
  usage_spike:            { displayName: 'Usage Spike',            emoji: '📈', category: 'expansion' },
  nearing_paywall:        { displayName: 'Nearing Paywall',        emoji: '💰', category: 'expansion' },
  director_signup:        { displayName: 'Director Signup',        emoji: '👔', category: 'expansion' },
  invites_sent:           { displayName: 'Invites Sent',           emoji: '📨', category: 'expansion' },
  new_department_user:    { displayName: 'New Department User',    emoji: '🏢', category: 'expansion' },
  high_nps:               { displayName: 'High NPS',               emoji: '🌟', category: 'expansion' },
  trial_ending:           { displayName: 'Trial Ending',           emoji: '⏰', category: 'expansion' },
  upcoming_renewal:       { displayName: 'Upcoming Renewal',       emoji: '📋', category: 'expansion' },
  free_decision_maker:    { displayName: 'Free Decision Maker',    emoji: '🎯', category: 'expansion' },
  upgrade_page_visit:     { displayName: 'Upgrade Page Visit',     emoji: '🔍', category: 'expansion' },
  approaching_seat_limit: { displayName: 'Approaching Seat Limit', emoji: '💺', category: 'expansion' },
  overage:                { displayName: 'Usage Overage',          emoji: '📊', category: 'expansion' },

  // Churn risk signals (8)
  usage_drop:             { displayName: 'Usage Drop',             emoji: '📉', category: 'churn_risk' },
  low_nps:                { displayName: 'Low NPS',                emoji: '⚠️', category: 'churn_risk' },
  inactivity:             { displayName: 'Inactivity',             emoji: '💤', category: 'churn_risk' },
  usage_wow_decline:      { displayName: 'WoW Usage Decline',      emoji: '📉', category: 'churn_risk' },
  health_score_decrease:  { displayName: 'Health Score Decrease',  emoji: '🩺', category: 'churn_risk' },
  arr_decrease:           { displayName: 'ARR Decrease',           emoji: '💸', category: 'churn_risk' },
  incomplete_onboarding:  { displayName: 'Incomplete Onboarding',  emoji: '🚧', category: 'churn_risk' },
  future_cancellation:    { displayName: 'Future Cancellation',    emoji: '🚪', category: 'churn_risk' },
}

// ── Types ───────────────────────────────────────────────────────

export interface SignalNotificationContext {
  signal: {
    id: string
    type: string
    value: number | null
    details: Record<string, unknown>
    source: string
    timestamp: string
  }
  account: {
    id: string
    name: string
    domain: string | null
    health_score: number | null
  }
  workspace: {
    slug: string
  }
  posthog?: {
    host: string
    projectId: string
    personId?: string
    distinctId?: string
  }
  attio?: {
    recordId?: string
    domain?: string
  }
}

// Block Kit types (subset needed for building messages)
interface TextObject {
  type: 'plain_text' | 'mrkdwn'
  text: string
  emoji?: boolean
}

interface Block {
  type: string
  text?: TextObject
  fields?: TextObject[]
  elements?: (ButtonElement | TextObject)[]
  block_id?: string
}

interface ButtonElement {
  type: 'button'
  text: TextObject
  url: string
  action_id: string
  style?: 'primary' | 'danger'
}

// ── Message Builder ─────────────────────────────────────────────

/**
 * Build a Block Kit message for a detected signal notification.
 *
 * Returns both the rich `blocks` array and a plain `text` fallback
 * for notifications and accessibility contexts.
 */
export function buildSignalNotificationMessage(
  ctx: SignalNotificationContext
): { blocks: Block[]; text: string } {
  const meta = SIGNAL_TYPE_METADATA[ctx.signal.type]
  const displayName = meta?.displayName ?? formatSignalTypeFallback(ctx.signal.type)
  const emoji = meta?.emoji ?? '🔔'
  const category = meta?.category ?? 'expansion'

  const blocks: Block[] = []

  // ── Header block ──────────────────────────────────────────
  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: `${emoji} Signal: ${displayName}`,
      emoji: true,
    },
  })

  // ── Fields section ────────────────────────────────────────
  const fields: TextObject[] = [
    { type: 'mrkdwn', text: `*Account*\n${ctx.account.name}` },
    { type: 'mrkdwn', text: `*Category*\n${formatCategory(category)}` },
  ]

  // Add signal value if present (concrete grade)
  if (ctx.signal.value != null) {
    const grade = getConcreteGrade(ctx.signal.value)
    const label = getGradeLabel(ctx.signal.value)
    fields.push({ type: 'mrkdwn', text: `*Signal*\n${grade} (${label})` })
  }

  // Add health score if available
  if (ctx.account.health_score != null) {
    fields.push({ type: 'mrkdwn', text: `*Health*\n${ctx.account.health_score}/100` })
  }

  blocks.push({ type: 'section', fields })

  // ── Details text ──────────────────────────────────────────
  const detailsText = formatDetails(ctx.signal.details)
  if (detailsText) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: truncate(detailsText, 2000),
      },
    })
  }

  // ── Divider ───────────────────────────────────────────────
  blocks.push({ type: 'divider' })

  // ── Action buttons ────────────────────────────────────────
  const buttons = buildActionButtons(ctx)
  if (buttons.length > 0) {
    blocks.push({
      type: 'actions',
      elements: buttons,
    })
  }

  // ── Context block ─────────────────────────────────────────
  const timestamp = formatTimestamp(ctx.signal.timestamp)
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `📅 ${timestamp} · via ${ctx.signal.source}`,
      },
    ],
  })

  // ── Fallback text ─────────────────────────────────────────
  const detailsSummary = summarizeDetails(ctx.signal.details)
  const textParts = [`New signal: ${displayName} for ${ctx.account.name}`]
  if (detailsSummary) {
    textParts.push(`— ${detailsSummary}`)
  }
  const text = textParts.join(' ')

  return { blocks, text }
}

// ── Smart Link Resolution ───────────────────────────────────────

function buildActionButtons(ctx: SignalNotificationContext): ButtonElement[] {
  const buttons: ButtonElement[] = []
  const baseUrl = getAppBaseUrl()

  // View in Beton — always available
  buttons.push({
    type: 'button',
    text: { type: 'plain_text', text: 'View in Beton', emoji: true },
    url: `${baseUrl}/signals/${ctx.signal.id}`,
    action_id: 'view_in_beton',
    style: 'primary',
  })

  // PostHog — only if connected
  if (ctx.posthog) {
    const phUrl = buildPostHogUrl(ctx.posthog, ctx.account.domain)
    if (phUrl) {
      buttons.push({
        type: 'button',
        text: { type: 'plain_text', text: 'PostHog', emoji: true },
        url: phUrl,
        action_id: 'view_in_posthog',
      })
    }
  }

  // Attio — only if connected
  if (ctx.attio) {
    const attioUrl = buildAttioUrl(ctx.attio)
    if (attioUrl) {
      buttons.push({
        type: 'button',
        text: { type: 'plain_text', text: 'Attio', emoji: true },
        url: attioUrl,
        action_id: 'view_in_attio',
      })
    }
  }

  return buttons
}

function buildPostHogUrl(
  ph: NonNullable<SignalNotificationContext['posthog']>,
  accountDomain: string | null
): string | null {
  const host = ph.host.replace(/\/+$/, '')
  const base = host.startsWith('http') ? host : `https://${host}`

  // Direct link if we have a personId
  if (ph.personId) {
    return `${base}/project/${ph.projectId}/person/${ph.personId}`
  }

  // Search fallback: use distinctId or domain
  const searchTerm = ph.distinctId || accountDomain
  if (searchTerm) {
    return `${base}/project/${ph.projectId}/persons?search=${encodeURIComponent(searchTerm)}`
  }

  return null
}

function buildAttioUrl(
  attio: NonNullable<SignalNotificationContext['attio']>
): string | null {
  // Direct link if we have a recordId
  if (attio.recordId) {
    return `https://app.attio.com/objects/companies/${attio.recordId}`
  }

  // Search fallback using domain
  if (attio.domain) {
    return `https://app.attio.com/objects/companies?search=${encodeURIComponent(attio.domain)}`
  }

  return null
}

// ── Formatting Helpers ──────────────────────────────────────────

function formatCategory(category: 'expansion' | 'churn_risk'): string {
  return category === 'expansion' ? '🟢 Expansion' : '🔴 Churn Risk'
}

function formatSignalTypeFallback(type: string): string {
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * Format signal details into a human-readable markdown string.
 * Details is a free-form record — we pick known keys and format them.
 */
function formatDetails(details: Record<string, unknown>): string | null {
  if (!details || Object.keys(details).length === 0) return null

  // Check for a human-readable summary field first
  if (typeof details.summary === 'string') return details.summary
  if (typeof details.description === 'string') return details.description
  if (typeof details.message === 'string') return details.message

  // Build a formatted list from known fields
  const parts: string[] = []

  if (details.current_value != null && details.previous_value != null) {
    parts.push(`Value changed from ${details.previous_value} to ${details.current_value}`)
  }

  if (typeof details.change_percent === 'number') {
    const direction = details.change_percent > 0 ? 'increase' : 'decrease'
    parts.push(`${Math.abs(details.change_percent).toFixed(0)}% ${direction}`)
  }

  if (typeof details.threshold === 'number') {
    parts.push(`Threshold: ${details.threshold}`)
  }

  if (typeof details.days_remaining === 'number') {
    parts.push(`${details.days_remaining} days remaining`)
  }

  if (typeof details.user_name === 'string') {
    parts.push(`User: ${details.user_name}`)
  }

  if (typeof details.user_title === 'string') {
    parts.push(`Title: ${details.user_title}`)
  }

  if (typeof details.department === 'string') {
    parts.push(`Department: ${details.department}`)
  }

  if (parts.length === 0) return null
  return parts.join('\n')
}

/**
 * Summarize details into a single line for the fallback text.
 */
function summarizeDetails(details: Record<string, unknown>): string | null {
  if (!details || Object.keys(details).length === 0) return null

  if (typeof details.summary === 'string') return truncate(details.summary, 100)
  if (typeof details.description === 'string') return truncate(details.description, 100)
  if (typeof details.message === 'string') return truncate(details.message, 100)

  if (typeof details.change_percent === 'number') {
    const direction = details.change_percent > 0 ? 'increase' : 'decrease'
    return `${Math.abs(details.change_percent).toFixed(0)}% ${direction}`
  }

  return null
}

function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return timestamp
  }
}

/** Truncate text to maxLen, adding ellipsis if needed. */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen - 1) + '…'
}
