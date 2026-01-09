/**
 * Saved Queries Collection API
 *
 * GET /api/posthog/queries - List all saved queries
 * POST /api/posthog/queries - Create a new saved query
 */

import { NextResponse, type NextRequest } from 'next/server'
import { withRLSContext, withErrorHandler, InvalidQueryError, type RLSContext } from '@/lib/middleware'
import { SavedQueryRepository } from '@/lib/repositories'
import type { CreateSavedQueryRequest, PosthogSavedQuery } from '@/lib/types/posthog-query'

/**
 * GET handler - List all saved queries for workspace
 */
async function handleGetAll(
  request: NextRequest,
  context: RLSContext
): Promise<NextResponse<PosthogSavedQuery[]>> {
  const { supabase, workspaceId } = context
  const repository = new SavedQueryRepository(supabase)

  // Check for activeOnly query param
  const { searchParams } = new URL(request.url)
  const activeOnly = searchParams.get('active_only') === 'true'

  const queries = await repository.getAll(workspaceId, { activeOnly })

  return NextResponse.json(queries)
}

/**
 * POST handler - Create a new saved query
 */
async function handleCreate(
  request: NextRequest,
  context: RLSContext
): Promise<NextResponse<PosthogSavedQuery>> {
  const { supabase, workspaceId } = context
  const repository = new SavedQueryRepository(supabase)

  // Parse request body
  let body: CreateSavedQueryRequest
  try {
    body = await request.json()
  } catch {
    throw new InvalidQueryError('Invalid JSON in request body')
  }

  // Validate required fields
  if (!body.name || typeof body.name !== 'string') {
    throw new InvalidQueryError('Missing or invalid "name" field')
  }

  if (!body.query_text || typeof body.query_text !== 'string') {
    throw new InvalidQueryError('Missing or invalid "query_text" field')
  }

  const name = body.name.trim()
  const queryText = body.query_text.trim()

  if (!name) {
    throw new InvalidQueryError('Name cannot be empty')
  }

  if (!queryText) {
    throw new InvalidQueryError('Query text cannot be empty')
  }

  // Check for duplicate name
  const exists = await repository.existsByName(workspaceId, name)
  if (exists) {
    throw new InvalidQueryError(`A saved query with name "${name}" already exists`)
  }

  // Create the saved query
  const savedQuery = await repository.create({
    workspace_id: workspaceId,
    name,
    description: body.description?.trim() || null,
    query_text: queryText,
    is_active: true,
  })

  return NextResponse.json(savedQuery, { status: 201 })
}

// Route handlers with middleware
export const GET = withErrorHandler(withRLSContext(handleGetAll))
export const POST = withErrorHandler(withRLSContext(handleCreate))
