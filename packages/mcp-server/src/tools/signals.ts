/**
 * Signal tools (5 tools)
 *
 * - list_signals: List signals with filters, paginated
 * - get_signal: Signal details + metrics + related signals
 * - create_signal: Create custom signal with PostHog event matching
 * - get_signal_metrics: Metrics for a specific signal
 * - get_dashboard_metrics: Aggregated signal dashboard metrics
 */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ToolContext } from '../context/types.js'
import { toMcpError } from '../lib/errors.js'

export function registerSignalTools(
  server: McpServer,
  getContext: () => Promise<ToolContext>
): void {
  // ── list_signals ───────────────────────────────────────────────────
  server.tool(
    'list_signals',
    'List signals with optional filters (type, source, account, date range). Returns enriched signals with lift and confidence metrics.',
    {
      page: z.number().int().positive().default(1).describe('Page number'),
      limit: z.number().int().min(1).max(100).default(50).describe('Results per page'),
      type: z.string().optional().describe('Filter by signal type'),
      source: z.string().optional().describe('Filter by source (e.g. "heuristic", "manual")'),
      account_id: z.string().uuid().optional().describe('Filter by account UUID'),
      start_date: z.string().optional().describe('ISO date string for range start'),
      end_date: z.string().optional().describe('ISO date string for range end'),
    },
    async ({ page, limit, type, source, account_id, start_date, end_date }) => {
      try {
        const { supabase, workspaceId } = await getContext()

        let query = supabase
          .from('signals')
          .select('*, accounts(id, name, domain, arr, health_score)', { count: 'exact' })
          .eq('workspace_id', workspaceId)
          .order('timestamp', { ascending: false })

        if (type) query = query.eq('type', type)
        if (source) query = query.eq('source', source)
        if (account_id) query = query.eq('account_id', account_id)
        if (start_date) query = query.gte('timestamp', start_date)
        if (end_date) query = query.lte('timestamp', end_date)

        const from = (page - 1) * limit
        query = query.range(from, from + limit - 1)

        // Fetch signals and aggregates in parallel
        const [signalsResult, aggregatesResult] = await Promise.all([
          query,
          supabase
            .from('signal_aggregates')
            .select('*')
            .eq('workspace_id', workspaceId),
        ])

        const { data: signals, error, count } = signalsResult

        if (error) {
          return toMcpError(new Error(`Failed to fetch signals: ${error.message}`))
        }

        // Build aggregates lookup
        const aggMap: Record<string, Record<string, unknown>> = {}
        if (aggregatesResult.data) {
          for (const agg of aggregatesResult.data) {
            aggMap[agg.signal_type] = agg as unknown as Record<string, unknown>
          }
        }

        // Enrich signals with aggregate metrics
        const enriched = (signals || []).map((signal) => {
          const agg = aggMap[signal.type]
          if (!agg) return signal
          return {
            ...signal,
            details: {
              ...(signal.details as Record<string, unknown> || {}),
              lift: agg.avg_lift ?? null,
              confidence: agg.confidence_score ?? null,
              conversion_with: agg.avg_conversion_rate ?? null,
              match_count_7d: agg.count_last_7d ?? null,
              match_count_30d: agg.count_last_30d ?? null,
            },
          }
        })

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              signals: enriched,
              pagination: { page, limit, total: count || 0, pages: count ? Math.ceil(count / limit) : 0 },
            }, null, 2),
          }],
        }
      } catch (error) {
        return toMcpError(error)
      }
    }
  )

  // ── get_signal ─────────────────────────────────────────────────────
  server.tool(
    'get_signal',
    'Get detailed info for a specific signal including metrics, related signals, and account scores',
    { signal_id: z.string().uuid().describe('The signal UUID') },
    async ({ signal_id }) => {
      try {
        const { supabase, workspaceId } = await getContext()

        const { data: signal, error } = await supabase
          .from('signals')
          .select('*, accounts(id, name, domain, arr, health_score, status)')
          .eq('id', signal_id)
          .eq('workspace_id', workspaceId)
          .single()

        if (error || !signal) {
          return toMcpError(new Error('Signal not found'))
        }

        // Fetch metrics and related signals in parallel
        const [metricsResult, relatedResult, scoresResult] = await Promise.all([
          supabase
            .from('signal_aggregates')
            .select('*')
            .eq('workspace_id', workspaceId)
            .eq('signal_type', signal.type)
            .single(),
          supabase
            .from('signals')
            .select('id, type, value, timestamp')
            .eq('workspace_id', workspaceId)
            .eq('account_id', signal.account_id)
            .neq('id', signal_id)
            .order('timestamp', { ascending: false })
            .limit(5),
          supabase
            .from('heuristic_scores')
            .select('score_type, score_value, calculated_at')
            .eq('workspace_id', workspaceId)
            .eq('account_id', signal.account_id)
            .order('calculated_at', { ascending: false })
            .limit(3),
        ])

        const metrics = metricsResult.data ? {
          total_count: metricsResult.data.total_count,
          count_7d: metricsResult.data.count_last_7d,
          count_30d: metricsResult.data.count_last_30d,
          lift: metricsResult.data.avg_lift,
          conversion_rate: metricsResult.data.avg_conversion_rate,
          confidence: metricsResult.data.confidence_score,
          sample_size: metricsResult.data.sample_size,
          calculated_at: metricsResult.data.last_calculated_at,
        } : null

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              signal,
              metrics,
              related_signals: relatedResult.data || [],
              scores: scoresResult.data || [],
            }, null, 2),
          }],
        }
      } catch (error) {
        return toMcpError(error)
      }
    }
  )

  // ── create_signal ──────────────────────────────────────────────────
  server.tool(
    'create_signal',
    'Create a custom signal with PostHog event matching. Metrics are calculated asynchronously.',
    {
      name: z.string().describe('Signal display name'),
      event_name: z.string().describe('PostHog event name to match'),
      description: z.string().optional().describe('Signal description'),
      condition_operator: z.enum(['gte', 'gt', 'eq', 'lt', 'lte']).default('gte').describe('Comparison operator'),
      condition_value: z.number().nonnegative().default(1).describe('Threshold value'),
      time_window_days: z.number().int().min(1).max(365).default(7).describe('Time window in days'),
      conversion_event: z.string().optional().describe('Optional conversion event to measure'),
    },
    async ({ name, event_name, description, condition_operator, condition_value, time_window_days, conversion_event }) => {
      try {
        const { supabase, workspaceId } = await getContext()

        // Validate event_name format
        if (!/^[\w.$\-/:]+$/.test(event_name)) {
          return toMcpError(new Error('event_name contains invalid characters'))
        }

        const signalType = `custom:${event_name}`

        const { data: signal, error } = await supabase
          .from('signals')
          .insert({
            workspace_id: workspaceId,
            account_id: workspaceId, // Placeholder — custom signals are workspace-level
            type: signalType,
            source: 'manual',
            value: null,
            details: {
              name,
              description: description || '',
              event_name,
              condition_operator,
              condition_value,
              time_window_days,
              conversion_event: conversion_event || null,
              match_count: null,
            },
          } as never)
          .select()
          .single()

        if (error) {
          return toMcpError(new Error(`Failed to create signal: ${error.message}`))
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              signal,
              metrics: { status: 'calculating', match_count: null },
            }, null, 2),
          }],
        }
      } catch (error) {
        return toMcpError(error)
      }
    }
  )

  // ── get_signal_metrics ─────────────────────────────────────────────
  server.tool(
    'get_signal_metrics',
    'Get computed metrics (match count, lift, conversion rate, confidence) for a specific signal',
    { signal_id: z.string().uuid().describe('The signal UUID') },
    async ({ signal_id }) => {
      try {
        const { supabase, workspaceId } = await getContext()

        const { data: signal } = await supabase
          .from('signals')
          .select('id, type, details')
          .eq('id', signal_id)
          .eq('workspace_id', workspaceId)
          .single()

        if (!signal) {
          return toMcpError(new Error('Signal not found'))
        }

        const { data: metrics } = await supabase
          .from('signal_aggregates')
          .select('*')
          .eq('workspace_id', workspaceId)
          .eq('signal_type', signal.type)
          .single()

        if (!metrics) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ status: 'calculating', signal_id, signal_type: signal.type, metrics: null }, null, 2),
            }],
          }
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              status: 'ready',
              signal_id,
              signal_type: signal.type,
              metrics: {
                total_count: metrics.total_count,
                count_7d: metrics.count_last_7d,
                count_30d: metrics.count_last_30d,
                lift: metrics.avg_lift,
                conversion_rate: metrics.avg_conversion_rate,
                confidence: metrics.confidence_score,
                sample_size: metrics.sample_size,
                calculated_at: metrics.last_calculated_at,
              },
            }, null, 2),
          }],
        }
      } catch (error) {
        return toMcpError(error)
      }
    }
  )

  // ── get_dashboard_metrics ──────────────────────────────────────────
  server.tool(
    'get_dashboard_metrics',
    'Get aggregated dashboard metrics: total accounts, active accounts, signal counts, ARR, health scores',
    {
      lookback_days: z.number().int().min(1).max(365).default(30).describe('Lookback period in days'),
    },
    async ({ lookback_days }) => {
      try {
        const { supabase, workspaceId } = await getContext()

        // Call the database function
        const { data: dashboardMetrics, error } = await supabase.rpc(
          'get_dashboard_metrics',
          { p_workspace_id: workspaceId, p_lookback_days: lookback_days } as never
        )

        if (error) {
          // Fallback: manual query
          const { data: accounts } = await supabase
            .from('accounts')
            .select('id, status, health_score, arr')
            .eq('workspace_id', workspaceId)

          const { count: totalSignals } = await supabase
            .from('signals')
            .select('*', { count: 'exact', head: true })
            .eq('workspace_id', workspaceId)

          const total = accounts?.length || 0
          const active = accounts?.filter(a => a.status === 'active').length || 0
          const avgHealth = total > 0 ? (accounts?.reduce((s, a) => s + (a.health_score || 0), 0) || 0) / total : 0
          const totalArr = accounts?.reduce((s, a) => s + (a.arr || 0), 0) || 0

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                metrics: {
                  total_accounts: total,
                  active_accounts: active,
                  total_signals: totalSignals || 0,
                  avg_health_score: Math.round(avgHealth),
                  total_arr: totalArr,
                },
              }, null, 2),
            }],
          }
        }

        const metrics = (dashboardMetrics as Array<Record<string, unknown>>)?.[0] || {}

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ metrics }, null, 2),
          }],
        }
      } catch (error) {
        return toMcpError(error)
      }
    }
  )
}
