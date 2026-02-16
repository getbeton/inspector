'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useDemoMode } from '@/lib/hooks/use-demo-mode'
import { trackDemoTourCompleted } from '@/lib/analytics'

/**
 * Persistent banner shown when the user is in demo mode.
 * Provides a way to exit demo mode and start connecting real data.
 */
export function DemoBanner() {
  const { isDemoMode, exitDemoMode } = useDemoMode()
  const router = useRouter()

  if (!isDemoMode) return null

  const handleExit = () => {
    trackDemoTourCompleted()
    exitDemoMode()
    router.push('/')
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
      <Button variant="outline" size="sm" onClick={handleExit}>
        Connect real data
      </Button>
    </div>
  )
}
