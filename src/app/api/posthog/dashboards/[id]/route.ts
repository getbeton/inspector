/**
 * Dashboard Individual Resource API
 *
 * GET /api/posthog/dashboards/[id] - Get a dashboard by ID
 * PATCH /api/posthog/dashboards/[id] - Update a dashboard
 * DELETE /api/posthog/dashboards/[id] - Delete a dashboard
 */

import { NextResponse, type NextRequest } from 'next/server'
import { withRLSContext, withErrorHandler, InvalidQueryError, QueryError, type RLSContext } from '@/lib/middleware'
import { DashboardRepository } from '@/lib/repositories'
import type { UpdateDashboardRequest, PosthogDashboard } from '@/lib/types/posthog-query'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET handler - Get a dashboard by ID
 */
async function handleGet(
  request: NextRequest,
  context: RLSContext,
  params: RouteParams
): Promise<NextResponse<PosthogDashboard>> {
  const { supabase } = context
  const { id } = await params.params
  const repository = new DashboardRepository(supabase)

  const dashboard = await repository.getById(id)

  if (!dashboard) {
    throw new QueryError(`Dashboard with ID "${id}" not found`, 'NOT_FOUND')
  }

  return NextResponse.json(dashboard)
}

/**
 * PATCH handler - Update a dashboard
 */
async function handleUpdate(
  request: NextRequest,
  context: RLSContext,
  params: RouteParams
): Promise<NextResponse<PosthogDashboard>> {
  const { supabase, workspaceId } = context
  const { id } = await params.params
  const repository = new DashboardRepository(supabase)

  // Check if dashboard exists
  const existing = await repository.getById(id)
  if (!existing) {
    throw new QueryError(`Dashboard with ID "${id}" not found`, 'NOT_FOUND')
  }

  // Parse request body
  let body: UpdateDashboardRequest
  try {
    body = await request.json()
  } catch {
    throw new InvalidQueryError('Invalid JSON in request body')
  }

  // Build update payload with validation
  const updates: UpdateDashboardRequest = {}

  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) {
      throw new InvalidQueryError('Name cannot be empty')
    }
    // Check for duplicate name (excluding current record)
    if (name !== existing.name) {
      const exists = await repository.existsByName(workspaceId, name)
      if (exists) {
        throw new InvalidQueryError(`A dashboard with name "${name}" already exists`)
      }
    }
    updates.name = name
  }

  if (body.description !== undefined) {
    updates.description = body.description?.trim() || undefined
  }

  if (body.config !== undefined) {
    if (typeof body.config !== 'object' || body.config === null || Array.isArray(body.config)) {
      throw new InvalidQueryError('Config must be a valid object')
    }
    updates.config = body.config
  }

  if (body.is_active !== undefined) {
    updates.is_active = Boolean(body.is_active)
  }

  // Perform update if there are changes
  if (Object.keys(updates).length === 0) {
    throw new InvalidQueryError('No valid fields to update')
  }

  const dashboard = await repository.update(id, updates)

  return NextResponse.json(dashboard)
}

/**
 * DELETE handler - Delete a dashboard
 */
async function handleDelete(
  request: NextRequest,
  context: RLSContext,
  params: RouteParams
): Promise<NextResponse<{ success: boolean }>> {
  const { supabase } = context
  const { id } = await params.params
  const repository = new DashboardRepository(supabase)

  // Check if dashboard exists
  const existing = await repository.getById(id)
  if (!existing) {
    throw new QueryError(`Dashboard with ID "${id}" not found`, 'NOT_FOUND')
  }

  await repository.delete(id)

  return NextResponse.json({ success: true })
}

// Wrapper to pass params to handlers
function createHandler<T>(
  handler: (request: NextRequest, context: RLSContext, params: RouteParams) => Promise<NextResponse<T>>
) {
  return (params: RouteParams) => {
    return withErrorHandler(
      withRLSContext(async (request: NextRequest, context: RLSContext) => {
        return handler(request, context, params)
      })
    )
  }
}

// Route handlers with middleware
export const GET = (request: NextRequest, params: RouteParams) =>
  createHandler(handleGet)(params)(request)

export const PATCH = (request: NextRequest, params: RouteParams) =>
  createHandler(handleUpdate)(params)(request)

export const DELETE = (request: NextRequest, params: RouteParams) =>
  createHandler(handleDelete)(params)(request)
