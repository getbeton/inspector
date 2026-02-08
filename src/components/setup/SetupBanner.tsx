'use client'

import Link from 'next/link'
import { useSetupStatus, type SetupStatus } from '@/lib/hooks/use-setup-status'

function getBannerMessage(setupStatus: SetupStatus): string | null {
  if (setupStatus.setupComplete) return null

  const posthogMissing = !setupStatus.integrations.posthog
  const attioMissing = !setupStatus.integrations.attio

  if (posthogMissing && attioMissing) {
    return 'Connect PostHog and Attio to unlock real data.'
  }
  if (posthogMissing) {
    return 'Connect PostHog to start analyzing your product data.'
  }
  if (attioMissing) {
    return 'Connect Attio to sync signals to your CRM.'
  }

  return null
}

/**
 * Grey banner shown across all pages until PostHog and Attio are connected.
 * Self-contained — fetches its own setup status.
 */
export function SetupBanner() {
  const { data: setupStatus, isLoading } = useSetupStatus()

  if (isLoading || !setupStatus) return null

  const message = getBannerMessage(setupStatus)
  if (!message) return null

  return (
    <div className="bg-muted border-b border-border px-4 py-2.5 flex items-center gap-2">
      <svg className="w-4 h-4 shrink-0 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span className="text-sm text-muted-foreground">{message}</span>
      <Link href="/setup" className="ml-auto text-sm font-medium text-foreground hover:underline whitespace-nowrap">
        Complete Setup
      </Link>
    </div>
  )
}
