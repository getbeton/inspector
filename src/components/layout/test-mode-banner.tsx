'use client'

import { useState } from 'react'

const DISMISS_KEY = 'test-mode-banner-dismissed'

/**
 * Test / Preview mode banner.
 *
 * Shown on every dashboard page when `NEXT_PUBLIC_DEPLOYMENT_MODE` is set to
 * `'preview'`.  Dismissible per browser session (`sessionStorage`).
 */
export function TestModeBanner() {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false
    return sessionStorage.getItem(DISMISS_KEY) === '1'
  })

  const deploymentMode = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE

  // Only render in preview mode
  if (deploymentMode !== 'preview') return null
  if (dismissed) return null

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-40 flex items-center justify-center gap-3 px-4 py-2 text-sm font-medium"
      style={{ backgroundColor: '#FB8C00', color: '#1a1a1a' }}
    >
      <svg
        className="w-4 h-4 shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
      <span>Preview Environment — Using Stripe Test Mode</span>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss test mode banner"
        className="ml-auto rounded p-1 hover:bg-black/10 transition-colors"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  )
}
