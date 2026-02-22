/**
 * Workspace & Scoring tools (4 tools)
 *
 * - get_workspace: Workspace info + setup status
 * - get_integration_status: Which integrations are connected
 * - get_account_scores: Health/expansion/churn scores for an account
 * - list_accounts: List accounts with scores and signal counts
 */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ToolContext } from '../context/types.js'
import { toMcpError } from '../lib/errors.js'
import type { Json } from '../lib/copied/supabase-types.js'

export function registerWorkspaceTools(
  server: McpServer,
  getContext: () => Promise<ToolContext>
): void {
  // ── get_workspace ──────────────────────────────────────────────────
  server.tool(
    'get_workspace',
    'Get workspace info including setup completion status, connected integrations, and billing state',
    {},
    async () => {
      try {
        const { supabase, workspaceId } = await getContext()

        // Fetch workspace
        const { data: workspace } = await supabase
          .from('workspaces')
          .select('id, name, slug, website_url, subscription_status, created_at')
          .eq('id', workspaceId)
          .single()

        // Check integrations
        const { data: integrations } = await supabase
          .from('integration_configs')
          .select('integration_name, status, is_active')
          .eq('workspace_id', workspaceId)

        const posthog = integrations?.find(i => i.integration_name === 'posthog')
        const attio = integrations?.find(i => i.integration_name === 'attio')
        const posthogConnected = !!(posthog?.is_active && posthog?.status === 'connected')
        const attioConnected = !!(attio?.is_active && attio?.status === 'connected')

        // Check billing
        const { data: billing } = await supabase
          .from('workspace_billing')
          .select('status, stripe_customer_id')
          .eq('workspace_id', workspaceId)
          .single()

        const billingConfigured = billing?.status === 'active' ||
          (billing?.stripe_customer_id !== null && billing?.status !== 'card_required')

        const setupComplete = posthogConnected && attioConnected

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              workspace,
              setupComplete,
              integrations: { posthog: posthogConnected, attio: attioConnected },
              billing: {
                configured: !!billingConfigured,
                status: billing?.status || null,
              },
            }, null, 2),
          }],
        }
      } catch (error) {
        return toMcpError(error)
      }
    }
  )

  // ── get_integration_status ─────────────────────────────────────────
  server.tool(
    'get_integration_status',
    'List all integration connection statuses (PostHog, Stripe, Attio, Apollo)',
    {},
    async () => {
      try {
        const { supabase, workspaceId } = await getContext()

        const { data } = await supabase
          .from('integration_configs')
          .select('id, integration_name, status, last_validated_at, is_active, config_json, created_at, updated_at')
          .eq('workspace_id', workspaceId)

        const supported = ['posthog', 'stripe', 'attio', 'apollo']
        const statuses = supported.map(name => {
          const config = data?.find(i => i.integration_name === name)
          return {
            name,
            status: config?.status || 'disconnected',
            is_configured: !!config,
            is_active: config?.is_active || false,
            last_validated_at: config?.last_validated_at || null,
            config: config ? {
              ...(config.config_json as Record<string, Json>),
              has_api_key: true,
            } : null,
          }
        })

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ integrations: statuses }, null, 2),
          }],
        }
      } catch (error) {
        return toMcpError(error)
      }
    }
  )

  // ── get_account_scores ─────────────────────────────────────────────
  server.tool(
    'get_account_scores',
    'Get health, expansion, and churn risk scores for a specific account',
    { account_id: z.string().uuid().describe('The account UUID') },
    async ({ account_id }) => {
      try {
        const { supabase, workspaceId } = await getContext()

        // Verify account belongs to workspace
        const { data: account } = await supabase
          .from('accounts')
          .select('id, name, domain, health_score, fit_score')
          .eq('id', account_id)
          .eq('workspace_id', workspaceId)
          .single()

        if (!account) {
          return toMcpError(new Error('Account not found in this workspace'))
        }

        // Get stored scores
        const { data: storedScores } = await supabase
          .from('heuristic_scores')
          .select('score_type, score_value, component_scores, calculated_at')
          .eq('account_id', account_id)
          .eq('workspace_id', workspaceId)
          .order('calculated_at', { ascending: false })
          .limit(3)

        // Calculate fresh scores via database functions
        const [healthResult, expansionResult, churnResult] = await Promise.all([
          supabase.rpc('calculate_health_score', { p_account_id: account_id, p_workspace_id: workspaceId } as never),
          supabase.rpc('calculate_expansion_score', { p_account_id: account_id, p_workspace_id: workspaceId } as never),
          supabase.rpc('calculate_churn_risk_score', { p_account_id: account_id, p_workspace_id: workspaceId } as never),
        ])

        type ScoreRow = { score: number; component_scores?: Json; signal_count?: number; expansion_signals?: Json; risk_signals?: Json }
        const health = (healthResult.data as ScoreRow[] | null)?.[0]
        const expansion = (expansionResult.data as ScoreRow[] | null)?.[0]
        const churn = (churnResult.data as ScoreRow[] | null)?.[0]

        const healthScore = health?.score || account.health_score || 0
        const { data: gradeData } = await supabase.rpc('get_concrete_grade', { p_score: healthScore } as never)
        const grade = (gradeData as Array<{ grade: string; label: string; color: string }> | null)?.[0]

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              account: { id: account.id, name: account.name, domain: account.domain, fit_score: account.fit_score },
              scores: {
                health: { score: healthScore, component_scores: health?.component_scores || {}, signal_count: health?.signal_count || 0 },
                expansion: { score: expansion?.score || 0, signals: expansion?.expansion_signals || [] },
                churn_risk: { score: churn?.score || 0, signals: churn?.risk_signals || [] },
              },
              concrete_grade: grade || { grade: 'M50', label: 'Standard', color: '#f59e0b' },
              stored_scores: storedScores || [],
            }, null, 2),
          }],
        }
      } catch (error) {
        return toMcpError(error)
      }
    }
  )

  // ── list_accounts ──────────────────────────────────────────────────
  server.tool(
    'list_accounts',
    'List accounts with health scores, ARR, and signal counts. Supports pagination and filtering.',
    {
      page: z.number().int().positive().default(1).describe('Page number (default: 1)'),
      limit: z.number().int().min(1).max(100).default(50).describe('Results per page (default: 50, max: 100)'),
      status: z.enum(['active', 'churned', 'trial']).optional().describe('Filter by account status'),
      sort_by: z.enum(['health_score', 'arr', 'name', 'created_at']).default('health_score').describe('Sort field'),
      sort_order: z.enum(['asc', 'desc']).default('desc').describe('Sort direction'),
    },
    async ({ page, limit, status, sort_by, sort_order }) => {
      try {
        const { supabase, workspaceId } = await getContext()

        let query = supabase
          .from('accounts')
          .select('*', { count: 'exact' })
          .eq('workspace_id', workspaceId)
          .order(sort_by, { ascending: sort_order === 'asc' })

        if (status) {
          query = query.eq('status', status)
        }

        const from = (page - 1) * limit
        query = query.range(from, from + limit - 1)

        const { data: accounts, count, error } = await query

        if (error) {
          return toMcpError(new Error(`Failed to fetch accounts: ${error.message}`))
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              accounts: accounts || [],
              pagination: {
                page,
                limit,
                total: count || 0,
                pages: count ? Math.ceil(count / limit) : 0,
              },
            }, null, 2),
          }],
        }
      } catch (error) {
        return toMcpError(error)
      }
    }
  )
}
