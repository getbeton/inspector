'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { SetupWizard } from '@/components/setup'
import { useSetupStatus } from '@/lib/hooks/use-setup-status'
import { useSession } from '@/components/auth/session-provider'
import { GuestSignInPrompt } from '@/components/auth/GuestSignInPrompt'

function SetupPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const demoMode = searchParams.get('demo') === 'true'

  const { data: setupStatus, isLoading } = useSetupStatus()
  const { session, loading: sessionLoading } = useSession()

  const authBypass = session?.sub === 'auth-bypass'

  // If setup is already complete, redirect to home
  // NOTE: This useEffect MUST be before any conditional returns to satisfy
  // React's rules of hooks (hooks must be called in the same order every render).
  useEffect(() => {
    if (!demoMode && !isLoading && setupStatus?.setupComplete) {
      router.replace('/')
    }
  }, [demoMode, isLoading, setupStatus?.setupComplete, router])

  // In demo mode, skip all guards and render immediately
  if (demoMode) {
    return (
      <div className="max-w-6xl mx-auto py-8 px-4">
        <SetupWizard demoMode />
      </div>
    )
  }

  // Guest guard
  if (!sessionLoading && !session) return <GuestSignInPrompt message="Sign in to set up your workspace" />

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (setupStatus?.setupComplete) {
    return null
  }

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <SetupWizard
        billingEnabled={setupStatus?.billing?.required ?? false}
        setupStatus={setupStatus ? {
          integrations: setupStatus.integrations,
          billing: { configured: setupStatus.billing.configured },
        } : undefined}
        authBypass={authBypass}
      />
    </div>
  )
}

export default function SetupPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <SetupPageInner />
    </Suspense>
  )
}
