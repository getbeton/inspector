'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { SetupWizard } from '@/components/setup'
import { useSetupStatus } from '@/lib/hooks/use-setup-status'

export default function SetupPage() {
  const router = useRouter()
  const { data: setupStatus, isLoading } = useSetupStatus()

  // If setup is already complete, redirect to home
  useEffect(() => {
    if (!isLoading && setupStatus?.setupComplete) {
      router.replace('/')
    }
  }, [isLoading, setupStatus?.setupComplete, router])

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
