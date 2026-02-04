'use client'

import Link from 'next/link'
import type { SetupStatus } from '@/lib/hooks/use-setup-status'

interface SetupBannerProps {
  setupStatus: SetupStatus
}

function getBannerMessage(setupStatus: SetupStatus): string | null {
  if (setupStatus.setupComplete) return null

  const posthogMissing = !setupStatus.integrations.posthog
  const attioMissing = !setupStatus.integrations.attio
  const billingMissing = setupStatus.billing.required && !setupStatus.billing.configured

  if (posthogMissing && attioMissing && billingMissing) {
    return 'Complete setup to unlock real data — connect PostHog, Attio, and add a payment method.'
  }
  if (posthogMissing && attioMissing) {
    return 'Connect PostHog and Attio to unlock real data.'
  }
  if (posthogMissing && billingMissing) {
    return 'Connect PostHog and add a payment method.'
  }
  if (attioMissing && billingMissing) {
    return 'Connect Attio and add a payment method.'
  }
  if (posthogMissing) {
    return 'Connect PostHog to start analyzing your product data.'
  }
  if (attioMissing) {
    return 'Connect Attio to sync signals to your CRM.'
  }
  if (billingMissing) {
    return 'Add a payment method to activate your account.'
  }

  return null
}

export function SetupBanner({ setupStatus }: SetupBannerProps) {
  const message = getBannerMessage(setupStatus)
  if (!message) return null

  return (
    <div className="bg-primary/10 text-primary px-4 py-3 rounded-lg flex items-center gap-2">
      <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span className="text-sm">{message}</span>
      <Link href="/" className="ml-auto text-sm font-medium hover:underline whitespace-nowrap">
        Complete Setup
      </Link>
    </div>
  )
}
