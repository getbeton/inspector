/**
 * Dashboards Collection API
 *
 * GET /api/posthog/dashboards - List all dashboards
 * POST /api/posthog/dashboards - Create a new dashboard
 */

import { NextResponse, type NextRequest } from 'next/server'
import { withRLSContext, withErrorHandler, InvalidQueryError, type RLSContext } from '@/lib/middleware'
import { DashboardRepository } from '@/lib/repositories'
import type { CreateDashboardRequest, PosthogDashboard } from '@/lib/types/posthog-query'

/**
 * GET handler - List all dashboards for workspace
 */
async function handleGetAll(
  request: NextRequest,
  context: RLSContext
): Promise<NextResponse<PosthogDashboard[]>> {
  const { supabase, workspaceId } = context
  const repository = new DashboardRepository(supabase)

  // Check for activeOnly query param
  const { searchParams } = new URL(request.url)
  const activeOnly = searchParams.get('active_only') === 'true'

  const dashboards = await repository.getAll(workspaceId, { activeOnly })

  return NextResponse.json(dashboards)
}

/**
 * POST handler - Create a new dashboard
 */
async function handleCreate(
  request: NextRequest,
  context: RLSContext
): Promise<NextResponse<PosthogDashboard>> {
  const { supabase, workspaceId } = context
  const repository = new DashboardRepository(supabase)

  // Parse request body
  let body: CreateDashboardRequest
  try {
    body = await request.json()
  } catch {
    throw new InvalidQueryError('Invalid JSON in request body')
  }

  // Validate required fields
  if (!body.name || typeof body.name !== 'string') {
    throw new InvalidQueryError('Missing or invalid "name" field')
  }

  const name = body.name.trim()

  if (!name) {
    throw new InvalidQueryError('Name cannot be empty')
  }

  // Check for duplicate name
  const exists = await repository.existsByName(workspaceId, name)
  if (exists) {
    throw new InvalidQueryError(`A dashboard with name "${name}" already exists`)
  }

  // Validate config if provided
  let config: Record<string, unknown> = {}
  if (body.config !== undefined) {
    if (typeof body.config !== 'object' || body.config === null || Array.isArray(body.config)) {
      throw new InvalidQueryError('Config must be a valid object')
    }
    config = body.config
  }

  // Create the dashboard
  const dashboard = await repository.create({
    workspace_id: workspaceId,
    name,
    description: body.description?.trim() || null,
    config,
    is_active: true,
  })

  return NextResponse.json(dashboard, { status: 201 })
}

// Route handlers with middleware
export const GET = withErrorHandler(withRLSContext(handleGetAll))
export const POST = withErrorHandler(withRLSContext(handleCreate))
