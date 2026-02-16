'use client'

import { useMemo } from 'react'
import { JoinCandidatesSection } from '@/components/exploration/sections/join-candidates-section'
import { SchemaSection } from '@/components/exploration/sections/schema-section'
import { useSetupStatus } from '@/lib/hooks/use-setup-status'
import { useExplorationSessions, useWorkspaceEdaResults, useLatestChanges } from '@/lib/hooks/use-explorations'

export default function MemoryDbStructurePage() {
  const { data: setupStatus, isLoading: setupLoading } = useSetupStatus()
  const isDemo = !setupStatus || !setupStatus.setupComplete
  const workspaceId = isDemo ? undefined : setupStatus?.workspaceId

  const { data: sessions = [] } = useExplorationSessions(workspaceId)

  const latestCompletedSession = useMemo(
    () => sessions.find(s => s.status === 'completed'),
    [sessions]
  )
  const { data: latestEdaResults = [] } = useWorkspaceEdaResults(workspaceId)
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
        <h1 className="text-2xl font-bold">DB Structure</h1>
        <p className="text-muted-foreground">
          Database relationships and schema discovered by Beton
        </p>
      </div>

      <JoinCandidatesSection
        session={latestCompletedSession ?? null}
        edaResults={latestEdaResults}
        workspaceId={workspaceId}
        isDemo={isDemo}
        lastChange={latestChanges?.join_candidates ?? null}
      />

      <SchemaSection
        workspaceId={workspaceId}
        session={latestCompletedSession ?? null}
        edaResults={latestEdaResults}
      />
    </div>
  )
}
