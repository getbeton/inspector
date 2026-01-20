'use client'

import { useEffect, useRef } from 'react'
import { useSession } from '@/components/auth/session-provider'
import { pushToDataLayer } from './gtm'

/**
 * Hook to identify users with PostHog via GTM dataLayer.
 *
 * Flow:
 * 1. Session loads → push posthog_identify event to dataLayer
 * 2. GTM hears event → GTM tag calls posthog.identify()
 * 3. PostHog links anonymous distinct_id to authenticated user
 *
 * Cross-subdomain: Works because PostHog cookie is on .getbeton.ai
 * (requires PostHog init with persistence: 'cookie' and cross_subdomain_cookie: true)
 */
export function usePostHogIdentify() {
  const { session, loading } = useSession()
  const identifiedUserId = useRef<string | null>(null)

  useEffect(() => {
    if (loading) return

    const posthog =
      typeof window !== 'undefined'
        ? (window as unknown as { posthog?: { _isIdentified?: () => boolean } }).posthog
        : null

    // User is logged in
    if (session?.sub) {
      // Skip if already identified with same user
      if (identifiedUserId.current === session.sub) return

      // Check PostHog's internal state (if available)
      if (posthog?._isIdentified?.()) {
        identifiedUserId.current = session.sub
        return
      }

      // Push identify event to dataLayer → GTM will call posthog.identify()
      pushToDataLayer({
        event: 'posthog_identify',
        user_id: session.sub,
        user_properties_set: {
          email: session.email,
          name: session.name,
          workspace_id: session.workspace_id,
          workspace_name: session.workspace_name,
          role: session.role,
        },
        user_properties_set_once: {
          signed_up_at: new Date().toISOString(),
        },
      })

      identifiedUserId.current = session.sub
    }

    // User logged out — reset PostHog
    if (!session && identifiedUserId.current) {
      pushToDataLayer({ event: 'posthog_reset' })
      identifiedUserId.current = null
    }
  }, [session, loading])
}
