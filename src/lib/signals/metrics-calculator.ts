/**
 * Signal metrics calculator
 *
 * Generates and executes HogQL queries to compute signal metrics:
 * - Match count (total, 7d, 30d)
 * - Conversion rate (signal users who also triggered conversion event)
 * - Lift (signal conversion rate / baseline conversion rate)
 */

import { PostHogClient } from '@/lib/integrations/posthog/client'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = import('@supabase/supabase-js').SupabaseClient<any, any, any>

export interface MatchCountResult {
  total_count: number
  count_7d: number
  count_30d: number
}

export interface ConversionResult {
  conversion_rate: number
  baseline_rate: number
  lift: number
  signal_users: number
  converted_users: number
  sample_size: number
}

export interface MetricsResult {
  matchCount: MatchCountResult
  conversion?: ConversionResult
}

/**
 * Calculate match count for a signal event.
 * This is fast (~1-2s) and safe to run synchronously during signal creation.
 */
export async function calculateMatchCount(
  posthogClient: PostHogClient,
  eventName: string
): Promise<MatchCountResult> {
  const query = `
    SELECT
      count() as total_count,
      countIf(timestamp >= now() - interval 7 day) as count_7d,
      countIf(timestamp >= now() - interval 30 day) as count_30d
    FROM events
    WHERE event = '${escapeHogQL(eventName)}'
      AND timestamp >= now() - interval 90 day
  `

  const result = await posthogClient.query(query, { timeoutMs: 30_000 })

  if (!result.results || result.results.length === 0) {
    return { total_count: 0, count_7d: 0, count_30d: 0 }
  }

  const row = result.results[0]
  return {
    total_count: Number(row[0]) || 0,
    count_7d: Number(row[1]) || 0,
    count_30d: Number(row[2]) || 0,
  }
}

/**
 * Calculate conversion rate and lift for a signal event.
 * This is slower (~5-15s) due to the cross-event join.
 */
export async function calculateConversionAndLift(
  posthogClient: PostHogClient,
  signalEvent: string,
  conversionEvent: string
): Promise<ConversionResult> {
  // Signal conversion rate: what % of signal users also triggered conversion
  const signalQuery = `
    SELECT
      count(DISTINCT person_id) as signal_users,
      countIf(person_id IN (
        SELECT DISTINCT person_id FROM events
        WHERE event = '${escapeHogQL(conversionEvent)}'
          AND timestamp >= now() - interval 30 day
      )) as converted_users
    FROM events
    WHERE event = '${escapeHogQL(signalEvent)}'
      AND timestamp >= now() - interval 30 day
  `

  // Baseline conversion rate: overall conversion across all users
  const baselineQuery = `
    SELECT
      count(DISTINCT person_id) as total_users,
      countIf(person_id IN (
        SELECT DISTINCT person_id FROM events
        WHERE event = '${escapeHogQL(conversionEvent)}'
          AND timestamp >= now() - interval 30 day
      )) as converted_users
    FROM events
    WHERE timestamp >= now() - interval 30 day
  `

  const [signalResult, baselineResult] = await Promise.all([
    posthogClient.query(signalQuery, { timeoutMs: 60_000 }),
    posthogClient.query(baselineQuery, { timeoutMs: 60_000 }),
  ])

  const signalRow = signalResult.results?.[0] || [0, 0]
  const baselineRow = baselineResult.results?.[0] || [0, 0]

  const signalUsers = Number(signalRow[0]) || 0
  const convertedUsers = Number(signalRow[1]) || 0
  const totalUsers = Number(baselineRow[0]) || 0
  const baselineConverted = Number(baselineRow[1]) || 0

  const conversionRate = signalUsers > 0 ? convertedUsers / signalUsers : 0
  const baselineRate = totalUsers > 0 ? baselineConverted / totalUsers : 0
  const lift = baselineRate > 0 ? conversionRate / baselineRate : 0

  return {
    conversion_rate: conversionRate,
    baseline_rate: baselineRate,
    lift,
    signal_users: signalUsers,
    converted_users: convertedUsers,
    sample_size: signalUsers,
  }
}

/**
 * Store calculated metrics in signal_aggregates table
 */
export async function upsertSignalMetrics(
  supabase: AnySupabaseClient,
  workspaceId: string,
  signalType: string,
  matchCount: MatchCountResult,
  conversion?: ConversionResult
) {
  const data = {
    workspace_id: workspaceId,
    signal_type: signalType,
    total_count: matchCount.total_count,
    count_last_7d: matchCount.count_7d,
    count_last_30d: matchCount.count_30d,
    avg_lift: conversion?.lift ?? null,
    avg_conversion_rate: conversion?.conversion_rate ?? null,
    confidence_score: conversion ? Math.min(conversion.sample_size / 100, 1.0) : null,
    sample_size: conversion?.sample_size ?? null,
    last_calculated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('signal_aggregates')
    .upsert(data as never, {
      onConflict: 'workspace_id,signal_type',
    })

  if (error) {
    console.error('Failed to upsert signal metrics:', error)
    throw error
  }
}

/**
 * Escape single quotes in HogQL strings to prevent injection
 */
function escapeHogQL(value: string): string {
  return value.replace(/'/g, "\\'")
}
