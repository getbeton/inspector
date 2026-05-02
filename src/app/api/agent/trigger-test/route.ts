/**
 * POST /api/agent/trigger-test
 *
 * Test-only endpoint for the Mason E2E rig. Triggers an agent run for a given
 * workspace_id, bypassing the cookie-based session that /api/onboarding/complete
 * normally requires. Authenticated by the same AGENT_SECRET header that all the
 * other /api/agent/* routes use.
 *
 * NEVER merge to main. This branch (`mason-e2e-test`) exists only to give the
 * Mason E2E driver a way to kick off a run without hosting a Supabase auth
 * session. The endpoint is hard-gated to the AGENT_SECRET, but to be safe it
 * also refuses to run when DEPLOYMENT_MODE !== 'preview' AND the workspace
 * isn't explicitly marked test-mode in its slug ("mason-e2e-").
 */

import { NextRequest, NextResponse } from 'next/server'
import { validateAgentRequest } from '@/lib/agent/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { AgentService } from '@/lib/agent/agent-service'
import { createModuleLogger } from '@/lib/utils/logger'

const log = createModuleLogger('[Agent][TriggerTest]')

export async function POST(req: NextRequest) {
  if (!validateAgentRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { workspace_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const workspaceId = (body.workspace_id || '').trim()
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspace_id required' }, { status: 400 })
  }

  // Defense in depth: refuse to trigger arbitrary workspaces in production-like
  // envs. Only allow test workspaces (slug prefix `mason-e2e-`).
  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('workspaces')
    .select('id, slug, name')
    .eq('id', workspaceId)
    .single()
  if (error || !data) {
    return NextResponse.json({ error: 'workspace not found' }, { status: 404 })
  }
  const slug = String((data as { slug?: string }).slug || '')
  if (!slug.startsWith('mason-e2e-')) {
    return NextResponse.json(
      { error: 'workspace not eligible for test trigger', slug },
      { status: 403 },
    )
  }

  try {
    await AgentService.triggerAnalysis(workspaceId)
    log.info(`Triggered test analysis for workspace=${workspaceId} slug=${slug}`)
    return NextResponse.json({ ok: true, workspace_id: workspaceId, slug })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'trigger failed'
    log.error(`Trigger failed for ${workspaceId}: ${msg}`)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
