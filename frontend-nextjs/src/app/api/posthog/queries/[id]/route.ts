/**
 * Saved Query Individual Resource API
 *
 * GET /api/posthog/queries/[id] - Get a saved query by ID
 * PATCH /api/posthog/queries/[id] - Update a saved query
 * DELETE /api/posthog/queries/[id] - Delete a saved query
 */

import { NextResponse, type NextRequest } from 'next/server'
import { withRLSContext, withErrorHandler, InvalidQueryError, QueryError, type RLSContext } from '@/lib/middleware'
import { SavedQueryRepository } from '@/lib/repositories'
import type { UpdateSavedQueryRequest, PosthogSavedQuery } from '@/lib/types/posthog-query'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET handler - Get a saved query by ID
 */
async function handleGet(
  request: NextRequest,
  context: RLSContext,
  params: RouteParams
): Promise<NextResponse<PosthogSavedQuery>> {
  const { supabase } = context
  const { id } = await params.params
  const repository = new SavedQueryRepository(supabase)

  const savedQuery = await repository.getById(id)

  if (!savedQuery) {
    throw new QueryError(`Saved query with ID "${id}" not found`, 'NOT_FOUND')
  }

  return NextResponse.json(savedQuery)
}

/**
 * PATCH handler - Update a saved query
 */
async function handleUpdate(
  request: NextRequest,
  context: RLSContext,
  params: RouteParams
): Promise<NextResponse<PosthogSavedQuery>> {
  const { supabase, workspaceId } = context
  const { id } = await params.params
  const repository = new SavedQueryRepository(supabase)

  // Check if query exists
  const existing = await repository.getById(id)
  if (!existing) {
    throw new QueryError(`Saved query with ID "${id}" not found`, 'NOT_FOUND')
  }

  // Parse request body
  let body: UpdateSavedQueryRequest
  try {
    body = await request.json()
  } catch {
    throw new InvalidQueryError('Invalid JSON in request body')
  }

  // Build update payload with validation
  const updates: UpdateSavedQueryRequest = {}

  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) {
      throw new InvalidQueryError('Name cannot be empty')
    }
    // Check for duplicate name (excluding current record)
    if (name !== existing.name) {
      const exists = await repository.existsByName(workspaceId, name)
      if (exists) {
        throw new InvalidQueryError(`A saved query with name "${name}" already exists`)
      }
    }
    updates.name = name
  }

  if (body.query_text !== undefined) {
    const queryText = typeof body.query_text === 'string' ? body.query_text.trim() : ''
    if (!queryText) {
      throw new InvalidQueryError('Query text cannot be empty')
    }
    updates.query_text = queryText
  }

  if (body.description !== undefined) {
    updates.description = body.description?.trim() || undefined
  }

  if (body.is_active !== undefined) {
    updates.is_active = Boolean(body.is_active)
  }

  // Perform update if there are changes
  if (Object.keys(updates).length === 0) {
    throw new InvalidQueryError('No valid fields to update')
  }

  const savedQuery = await repository.update(id, updates)

  return NextResponse.json(savedQuery)
}

/**
 * DELETE handler - Delete a saved query
 */
async function handleDelete(
  request: NextRequest,
  context: RLSContext,
  params: RouteParams
): Promise<NextResponse<{ success: boolean }>> {
  const { supabase } = context
  const { id } = await params.params
  const repository = new SavedQueryRepository(supabase)

  // Check if query exists
  const existing = await repository.getById(id)
  if (!existing) {
    throw new QueryError(`Saved query with ID "${id}" not found`, 'NOT_FOUND')
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
