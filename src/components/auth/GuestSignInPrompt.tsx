'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

interface GuestSignInPromptProps {
  message?: string
}

/**
 * Full-page sign-in prompt shown to guest users when they try to access
 * authenticated-only features (settings, setup, signal creation, etc.).
 */
export function GuestSignInPrompt({ message = 'Sign in to continue' }: GuestSignInPromptProps) {
  const router = useRouter()
  const [isSigningIn, setIsSigningIn] = useState(false)

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
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
          <span className="text-primary font-bold text-2xl">B</span>
        </div>
        <h2 className="text-xl font-semibold mb-2">{message}</h2>
        <p className="text-muted-foreground mb-6">
          Sign in with your Google account to access this feature.
        </p>
        <div className="flex flex-col items-center gap-3">
          <Button size="lg" onClick={handleSignIn} disabled={isSigningIn} className="w-full">
            {isSigningIn ? 'Signing in...' : 'Sign in with Google'}
          </Button>
          <button
            onClick={() => router.back()}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Back to demo
          </button>
        </div>
      </div>
    </div>
  )
}
