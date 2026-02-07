'use client'

import { usePostHogIdentify } from '@/lib/analytics'

/**
 * Component that triggers PostHog user identification.
 * Must be used within SessionProvider since usePostHogIdentify depends on useSession.
 *
 * This component handles:
 * - Identifying users when they log in (page load with active session)
 * - Resetting PostHog identity when users log out
 */
export function PostHogIdentifyProvider({ children }: { children: React.ReactNode }) {
  usePostHogIdentify()
  return <>{children}</>
}
