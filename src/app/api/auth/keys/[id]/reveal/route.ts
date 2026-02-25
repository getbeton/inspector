import { createClient } from '@/lib/supabase/server'
import { getWorkspaceMembership } from '@/lib/supabase/helpers'
import { NextResponse } from 'next/server'
import { decrypt } from '@/lib/crypto/encryption'
import { applyRateLimit, RATE_LIMITS } from '@/lib/utils/api-rate-limit'

/**
 * GET /api/auth/keys/[id]/reveal
 * Decrypt and return the plaintext API key (requires authentication)
 *
 * Security fixes:
 * - M13: Audit logging on key reveal
 * - M14: Rate limiting on sensitive endpoint
 * - Cache-Control: no-store to prevent browser caching of secrets
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // M14 fix: Rate limit key reveal
  const rateLimitResponse = applyRateLimit(request, 'api-key-reveal', RATE_LIMITS.VALIDATION)
  if (rateLimitResponse) return rateLimitResponse

  try {
    const { id } = await params
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const membership = await getWorkspaceMembership()
    if (!membership) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    // M13 fix: Audit log for key reveal
    console.log(`[Audit] API key reveal: user=${user.id} key=${id} workspace=${membership.workspaceId}`)

    // Fetch the encrypted key for this specific key + workspace + user
    // Note: encrypted_key column added via migration 021 — cast until types regenerated
    const { data, error } = await supabase
      .from('api_keys')
      .select('encrypted_key')
      .eq('id', id)
      .eq('workspace_id', membership.workspaceId)
      .eq('user_id', user.id)
      .single() as { data: { encrypted_key: string | null } | null; error: { message?: string } | null }

    // If the column doesn't exist yet (migration 021 not applied), treat as non-revealable
    if (error && /encrypted_key|column/.test(error.message ?? '')) {
      return NextResponse.json(
        { error: 'Encrypted key storage is not yet available. Please apply migration 021.' },
        { status: 410 },
      )
    }

    if (error || !data) {
      return NextResponse.json({ error: 'Key not found' }, { status: 404 })
    }

    if (!data.encrypted_key) {
      return NextResponse.json(
        { error: 'This key was created before encrypted storage. It cannot be revealed.' },
        { status: 410 },
      )
    }

    const plaintext = await decrypt(data.encrypted_key)

    return NextResponse.json(
      { key: plaintext },
      {
        headers: {
          // Prevent browser caching of the revealed key
          'Cache-Control': 'no-store',
        },
      }
    )
  } catch (error) {
    console.error('Error in GET /api/auth/keys/[id]/reveal:', error)
    return NextResponse.json({ error: 'Failed to reveal key' }, { status: 500 })
  }
}
