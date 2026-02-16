/**
 * Shared cron endpoint authentication.
 *
 * Fail-closed: if CRON_SECRET is not configured, all requests are rejected.
 * Accepts either:
 *   - Authorization: Bearer <secret>
 *   - x-cron-secret: <secret>
 */

export function verifyCronAuth(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    console.warn('[Cron Auth] CRON_SECRET not configured — rejecting request')
    return false
  }

  const authHeader = request.headers.get('authorization')
  if (authHeader === `Bearer ${cronSecret}`) return true

  const cronSecretHeader = request.headers.get('x-cron-secret')
  return cronSecretHeader === cronSecret
}
