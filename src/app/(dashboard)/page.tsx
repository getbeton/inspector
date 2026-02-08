'use client'

import { useRouter } from 'next/navigation'
import { SetupWizard } from '@/components/setup'
import { PreSetupView } from '@/components/home/PreSetupView'
import { WorkspaceSummary } from '@/components/home/WorkspaceSummary'
import { useSetupStatus } from '@/lib/hooks/use-setup-status'
import { useDemoMode } from '@/lib/hooks/use-demo-mode'
import { useEffect } from 'react'

export default function DashboardHomePage() {
  const router = useRouter()
  const { data: setupStatus, isLoading, error } = useSetupStatus()
  const { isDemoMode } = useDemoMode()

  // If demo mode is active and setup isn't complete, redirect to signals
  useEffect(() => {
    if (!isLoading && isDemoMode && !setupStatus?.setupComplete) {
      router.replace('/signals')
    }
  }, [isLoading, isDemoMode, setupStatus?.setupComplete, router])

  // Loading state
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

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center max-w-md">
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-6 h-6 text-destructive"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
          <p className="text-muted-foreground mb-4">{error.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  // State A: Setup complete → show dashboard
  if (setupStatus?.setupComplete) {
    return <WorkspaceSummary />
  }

  // State B: Demo mode active → redirecting to /signals (handled by useEffect above)
  if (isDemoMode) {
    return null
  }

  // State C: Has started setup (at least one integration connected) → show wizard
  if (setupStatus?.integrations.posthog || setupStatus?.integrations.attio) {
    return (
      <div className="max-w-2xl mx-auto py-8">
        <SetupWizard
          billingEnabled={setupStatus?.billing?.required ?? false}
          setupStatus={setupStatus ? {
            integrations: setupStatus.integrations,
            billing: { configured: setupStatus.billing.configured },
          } : undefined}
        />
      </div>
    )
  }

  // State D: Brand new user → show pre-setup view
  return (
    <div className="max-w-2xl mx-auto py-8">
      <PreSetupView />
    </div>
  )
}
