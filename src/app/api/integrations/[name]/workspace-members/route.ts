/**
 * GET /api/integrations/[name]/workspace-members
 *   → { members: WorkspaceMember[] }
 *
 * Powers the Link tab's "pick a member" (dropped from v1 but kept as API surface
 * for the Formula tab's member.* autocomplete).
 */

import { NextResponse, type NextRequest } from 'next/server'
import { withRLSContext, withErrorHandler, type RLSContext } from '@/lib/middleware'
import { getIntegrationCredentials } from '@/lib/integrations/credentials'
import { listWorkspaceMembers } from '@/lib/integrations/attio/client'

async function handler(
  request: NextRequest,
  ctx: RLSContext,
  { params }: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  const { name } = await params
  if (name !== 'attio') {
    return NextResponse.json({ error: `Unsupported destination "${name}"` }, { status: 400 })
  }

  const creds = await getIntegrationCredentials(ctx.workspaceId, 'attio')
  if (!creds) {
    return NextResponse.json({ members: [] })
  }

  try {
    const raw = await listWorkspaceMembers(creds.apiKey)
    const members = raw.map((m) => ({
      id: m.id,
      email: m.email,
      firstName: m.firstName,
      lastName: m.lastName,
      avatarUrl: m.avatarUrl,
      accessLevel: m.accessLevel,
    }))
    return NextResponse.json({ members })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list members'
    return NextResponse.json({ error: message, members: [] }, { status: 500 })
  }
}

export const GET = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ name: string }> }) => {
    const wrapped = withRLSContext((req, c) => handler(req, c, { params }))
    return wrapped(request)
  },
)
