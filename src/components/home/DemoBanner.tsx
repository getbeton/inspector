'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useDemoMode } from '@/lib/hooks/use-demo-mode'
import { useSession } from '@/components/auth/session-provider'
import { trackDemoTourCompleted } from '@/lib/analytics'

/**
 * Persistent banner shown when the user is in demo mode.
 * For guests: always visible, CTA is "Sign in with Google".
 * For authenticated users: visible when demo mode active, CTA is "Connect real data".
 */
export function DemoBanner() {
  const { isDemoMode, exitDemoMode } = useDemoMode()
  const { session } = useSession()
  const router = useRouter()
  const [isSigningIn, setIsSigningIn] = useState(false)

  const isGuest = !session

  // Show banner for guests (always) or authenticated users in demo mode
  if (!isGuest && !isDemoMode) return null

  const handleExit = () => {
    trackDemoTourCompleted()
    exitDemoMode()
    router.push('/')
  }

  const handleSignIn = async () => {
    try {
      setIsSigningIn(true)
      const { signInWithGoogle } = await import('@/lib/auth/supabase')
      await signInWithGoogle()
    } catch {
      setIsSigningIn(false)
    }
  }

  return (
    <div className="bg-primary/10 border border-primary/20 rounded-lg px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-sm font-medium text-primary">
          Viewing demo data
        </span>
      </div>
      {isGuest ? (
        <Button variant="outline" size="sm" onClick={handleSignIn} disabled={isSigningIn}>
          {isSigningIn ? 'Signing in...' : 'Sign in with Google'}
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={handleExit}>
          Connect real data
        </Button>
      )}
    </div>
  )
}
