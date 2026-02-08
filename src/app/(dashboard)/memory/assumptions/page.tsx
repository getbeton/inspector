'use client'

import { useMemo } from 'react'
import { WebsiteSection } from '@/components/exploration/sections/website-section'
import { useSetupStatus } from '@/lib/hooks/use-setup-status'
import { useExplorationSessions, useSessionWebsiteResult, useLatestChanges } from '@/lib/hooks/use-explorations'

export default function MemoryAssumptionsPage() {
  const { data: setupStatus, isLoading: setupLoading } = useSetupStatus()
  const isDemo = !setupStatus || !setupStatus.setupComplete
  const workspaceId = isDemo ? undefined : setupStatus?.workspaceId

  const { data: sessions = [] } = useExplorationSessions(workspaceId)

  const latestCompletedSession = useMemo(
    () => sessions.find(s => s.status === 'completed'),
    [sessions]
  )
  const { data: websiteData = null, isLoading: websiteLoading } = useSessionWebsiteResult(
    workspaceId,
    latestCompletedSession?.session_id,
  )
  const { data: latestChanges } = useLatestChanges(workspaceId)

  if (setupLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Website Assumptions</h1>
        <p className="text-muted-foreground">
          What Beton understands about your business from your website
        </p>
      </div>

      <WebsiteSection
        websiteData={websiteData}
        isLoading={websiteLoading}
        workspaceId={workspaceId}
        sessionId={latestCompletedSession?.session_id}
        isDemo={isDemo}
        lastChange={latestChanges?.business_model ?? null}
      />
    </div>
  )
}
