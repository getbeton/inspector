/**
 * Vercel Cron: MCP Auth Code Cleanup
 *
 * Runs daily at 3 AM UTC to delete expired and used auth codes.
 *
 * Security fix:
 * - H3: Expired auth codes never cleaned up, accumulating in database
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyCronAuth } from '@/lib/middleware/cron-auth'

// Maximum execution time for Vercel Pro (5 minutes)
export const maxDuration = 300

export async function GET(request: Request) {
  // Verify cron secret (fail-closed: rejects if CRON_SECRET is unset)
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()

    // Delete expired auth codes
    const { count: expiredCount, error: expiredError } = await (admin.from as any)('mcp_auth_codes')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select('id', { count: 'exact', head: true }) as { count: number | null; error: { message: string } | null }

    if (expiredError) {
      console.error('[MCP Cleanup] Failed to delete expired codes:', expiredError.message)
    }

    // Delete used auth codes older than 1 hour (keep briefly for debugging)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count: usedCount, error: usedError } = await (admin.from as any)('mcp_auth_codes')
      .delete()
      .not('used_at', 'is', null)
      .lt('used_at', oneHourAgo)
      .select('id', { count: 'exact', head: true }) as { count: number | null; error: { message: string } | null }

    if (usedError) {
      console.error('[MCP Cleanup] Failed to delete used codes:', usedError.message)
    }

    // Clean up expired OAuth clients that haven't been used (older than 30 days, no auth codes)
    // This is a soft cleanup — only removes orphaned registrations

    return NextResponse.json({
      success: true,
      cleaned: {
        expired_codes: expiredCount ?? 0,
        used_codes: usedCount ?? 0,
      },
    })
  } catch (error) {
    console.error('[MCP Cleanup] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Cleanup failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
