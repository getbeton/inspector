'use client'

import { useEffect, useRef } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useSession } from '@/components/auth/session-provider'
import { trackSignup, trackLogin } from '@/lib/analytics'

/**
 * Tracks signup and login events after authentication.
 *
 * - Signup: Detected via ?signup=true query param (set by auth callback)
 * - Login: Detected on first session load per browser session
 *
 * Uses sessionStorage to prevent duplicate login events on page refresh.
 */
export function AuthTracker() {
  const { session, loading } = useSession()
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const hasTracked = useRef(false)

  useEffect(() => {
    if (loading || !session?.sub || hasTracked.current) return

    const isSignup = searchParams.get('signup') === 'true'

    if (isSignup) {
      // New user signup
      trackSignup(session.sub, {
        email: session.email,
        workspace_id: session.workspace_id,
        workspace_name: session.workspace_name,
      })

      // Clean up URL (remove ?signup=true)
      const newParams = new URLSearchParams(searchParams.toString())
      newParams.delete('signup')
      const newUrl = newParams.toString() ? `${pathname}?${newParams}` : pathname
      router.replace(newUrl, { scroll: false })

      hasTracked.current = true
    } else {
      // Returning user login — track once per browser session
      const loginTrackedKey = `login_tracked_${session.sub}`
      if (!sessionStorage.getItem(loginTrackedKey)) {
        trackLogin(session.sub, {
          email: session.email,
          workspace_id: session.workspace_id,
        })
        sessionStorage.setItem(loginTrackedKey, 'true')
      }
      hasTracked.current = true
    }
  }, [session, loading, searchParams, router, pathname])

  return null
}
