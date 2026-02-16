/**
 * POST /api/posthog/cohorts
 *
 * Secure proxy for creating PostHog static cohorts.
 * API key never leaves the server. Cohort URL is constructed server-side.
 *
 * Request:
 * {
 *   "name": "Signal: Pricing Page Interest",
 *   "distinct_ids": ["user1@example.com", "user2@example.com"]
 * }
 *
 * Response:
 * {
 *   "cohort_id": 42,
 *   "cohort_name": "Signal: Pricing Page Interest",
 *   "cohort_url": "https://us.posthog.com/project/12345/cohorts/42"
 * }
 */

import { NextResponse, type NextRequest } from 'next/server'
import { withRLSContext, withErrorHandler, type RLSContext } from '@/lib/middleware'
import { PostHogClient } from '@/lib/integrations/posthog/client'
import { getPostHogConfig } from '@/lib/integrations/posthog/config'

const MAX_DISTINCT_IDS = 10000
const NAME_REGEX = /^[a-zA-Z0-9_.\-: ]+$/

interface CreateCohortBody {
  name: string
  distinct_ids: string[]
}

function validateBody(body: unknown): CreateCohortBody {
  if (!body || typeof body !== 'object') {
    throw new Error('Request body must be a JSON object')
  }

  const b = body as Record<string, unknown>

  if (typeof b.name !== 'string' || !b.name.trim()) {
    throw new Error('name is required')
  }
  if (!NAME_REGEX.test(b.name)) {
    throw new Error('name contains invalid characters')
  }

  if (!Array.isArray(b.distinct_ids) || b.distinct_ids.length === 0) {
    throw new Error('distinct_ids must be a non-empty array')
  }
  if (b.distinct_ids.length > MAX_DISTINCT_IDS) {
    throw new Error(`distinct_ids must have at most ${MAX_DISTINCT_IDS} items`)
  }
  for (const id of b.distinct_ids) {
    if (typeof id !== 'string') {
      throw new Error('All distinct_ids must be strings')
    }
  }

  return {
    name: b.name.trim(),
    distinct_ids: b.distinct_ids as string[],
  }
}

async function handleCreateCohort(
  request: NextRequest,
  context: RLSContext
): Promise<NextResponse> {
  const { workspaceId } = context

  let body: CreateCohortBody
  try {
    const raw = await request.json()
    body = validateBody(raw)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid request' },
      { status: 400 }
    )
  }

  const config = await getPostHogConfig(workspaceId)
  const client = new PostHogClient({
    apiKey: config.apiKey,
    projectId: config.projectId,
    host: config.host,
  })

  const cohort = await client.createStaticCohort(body.name, body.distinct_ids)

  // Construct cohort URL server-side — no credentials exposed
  const cohortUrl = `${config.appHost}/project/${config.projectId}/cohorts/${cohort.id}`

  return NextResponse.json({
    cohort_id: cohort.id,
    cohort_name: cohort.name,
    cohort_url: cohortUrl,
  }, { status: 201 })
}

export const POST = withErrorHandler(withRLSContext(handleCreateCohort))
