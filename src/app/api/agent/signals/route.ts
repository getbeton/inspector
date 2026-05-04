/**
 * Agent ingestion endpoint for signal definitions.
 *
 * inspector-ml-backend calls this when its `store_candidate_signal` tool has
 * promoted a candidate. We upsert the candidate into `signal_definitions` with
 * `source='agent'` so the existing tracking pipeline (cron + metrics) picks it
 * up on the next daily pass.
 *
 * Auth: `x-agent-secret` header (shared with the rest of /api/agent/*).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createModuleLogger } from '@/lib/utils/logger'
import { validateAgentRequest } from '@/lib/agent/auth'
import { rateLimitResponse } from '@/lib/agent/rate-limit'
import { resolveSession } from '@/lib/agent/session'

const log = createModuleLogger('[API][Agent][Signals]')

interface ReviewDecision {
  promotion_readiness?: boolean
  decision?: string
  notes?: string
}

interface PromotionEvidence {
  success_count?: number
  success_avg?: number
  grey_count?: number
  grey_avg?: number
  failure_count?: number
  failure_avg?: number
  [key: string]: unknown
}

interface AgentCandidate {
  name: string
  entity_grain?: string
  target_event?: string
  time_window?: string
  comparison_baseline?: string
  query_template: string
  parameter_set?: Record<string, string | number | boolean>
  interpretation?: string
  review_decision?: ReviewDecision
  status?: 'candidate' | 'promoted' | 'rejected' | 'active'
  promotion_evidence?: PromotionEvidence
}

interface AgentSignalsRequest {
  session_id: string
  candidate?: AgentCandidate
  candidates?: AgentCandidate[]
}

function validateCandidate(c: unknown, index: number): string | null {
  if (!c || typeof c !== 'object') return `candidate[${index}] is not an object`
  const cand = c as Record<string, unknown>
  if (typeof cand.name !== 'string' || !cand.name) return `candidate[${index}].name required`
  if (typeof cand.query_template !== 'string' || !cand.query_template) {
    return `candidate[${index}].query_template required`
  }
  return null
}

export async function POST(req: NextRequest) {
  if (!validateAgentRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: AgentSignalsRequest
  try {
    body = (await req.json()) as AgentSignalsRequest
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { session_id, candidate, candidates } = body
  if (!session_id) {
    return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })
  }

  const items: AgentCandidate[] = candidates ?? (candidate ? [candidate] : [])
  if (items.length === 0) {
    return NextResponse.json({ error: 'No candidates provided' }, { status: 400 })
  }

  for (let i = 0; i < items.length; i++) {
    const err = validateCandidate(items[i], i)
    if (err) return NextResponse.json({ error: err }, { status: 400 })
  }

  let workspaceId: string
  try {
    const session = await resolveSession(session_id)
    workspaceId = session.workspaceId
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Invalid session'
    return NextResponse.json({ error: msg }, { status: 404 })
  }

  const limited = rateLimitResponse(workspaceId)
  if (limited) return limited

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const rows = items.map((c) => ({
    workspace_id: workspaceId,
    source: 'agent',
    name: c.name,
    type: `agent:${c.name}`,
    description: c.interpretation ?? '',
    entity_grain: c.entity_grain ?? 'distinct_id',
    target_event: c.target_event ?? null,
    time_window: c.time_window ?? null,
    comparison_baseline: c.comparison_baseline ?? null,
    query_template: c.query_template,
    parameter_set: c.parameter_set ?? {},
    interpretation: c.interpretation ?? null,
    review_decision: c.review_decision ?? null,
    status: c.status ?? 'promoted',
    promotion_evidence: c.promotion_evidence ?? null,
    created_by: `agent:${session_id}`,
    is_active: true,
    // event_name / condition_* / time_window_days left NULL for agent rows;
    // the query_template is the canonical source of truth.
  }))

  const { data, error } = await supabase
    .from('signal_definitions')
    .upsert(rows, { onConflict: 'workspace_id,name' })
    .select()

  if (error) {
    log.error(`Upsert failed for workspace ${workspaceId}: ${error.message}`)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  log.warn(
    `[AUDIT] Agent upserted ${rows.length} signal_definitions for workspace ${workspaceId}`,
  )

  return NextResponse.json({
    success: true,
    inserted: data?.length ?? 0,
    definitions: data,
  })
}
