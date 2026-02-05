'use client'

import { useState, useMemo, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { ExplorationFiltersBar, type ExplorationFilters } from '@/components/exploration/exploration-filters-bar'
import { ExplorationRunsTable, type SortColumn, type SortDirection } from '@/components/exploration/exploration-runs-table'
import { ExplorationSheet } from '@/components/exploration/exploration-sheet'
import { WebsiteSection } from '@/components/exploration/sections/website-section'
import { JoinCandidatesSection } from '@/components/exploration/sections/join-candidates-section'
import { SchemaSection } from '@/components/exploration/sections/schema-section'
import { SetupBanner } from '@/components/setup'
import { useSetupStatus } from '@/lib/hooks/use-setup-status'
import { useExplorationSessions, useSessionEdaResults, useSessionWebsiteResult } from '@/lib/hooks/use-explorations'
import type { ExplorationSession } from '@/lib/api/explorations'

const STATUS_ORDER: Record<string, number> = {
  running: 0,
  created: 1,
  completed: 2,
  failed: 3,
  closed: 4,
}

function getDurationMs(session: ExplorationSession): number {
  if (!session.started_at) return 0
  const start = new Date(session.started_at).getTime()
  const end = session.completed_at ? new Date(session.completed_at).getTime() : Date.now()
  return end - start
}

export default function MemoryPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const { data: setupStatus, isLoading: setupLoading } = useSetupStatus()
  const isDemo = !setupStatus || !setupStatus.setupComplete
  const workspaceId = isDemo ? undefined : setupStatus?.workspaceId

  const { data: sessions = [], isLoading: sessionsLoading } = useExplorationSessions(workspaceId)

  // Latest completed session = source of "current state"
  const latestCompletedSession = useMemo(
    () => sessions.find(s => s.status === 'completed'),
    [sessions]
  )
  const { data: latestEdaResults = [] } = useSessionEdaResults(
    workspaceId,
    latestCompletedSession?.session_id,
  )
  const { data: websiteData = null, isLoading: websiteLoading } = useSessionWebsiteResult(
    workspaceId,
    latestCompletedSession?.session_id,
  )

  const [filters, setFilters] = useState<ExplorationFilters>({
    search: '',
    status: 'all',
  })

  // Sorting state
  const [sortBy, setSortBy] = useState<SortColumn>('started')
  const [sortDir, setSortDir] = useState<SortDirection>('desc')

  const handleSortChange = useCallback((column: SortColumn) => {
    setSortBy(prev => {
      if (prev === column) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        return column
      }
      setSortDir('desc')
      return column
    })
  }, [])

  // Sheet state from URL
  const sheetSessionId = searchParams.get('sheet')
  const activeTab = searchParams.get('tab') || 'overview'

  const selectedSession = useMemo(
    () => sessions.find(s => s.session_id === sheetSessionId) || null,
    [sessions, sheetSessionId]
  )

  const filteredSessions = useMemo(() => {
    return sessions.filter(session => {
      if (filters.search) {
        const searchLower = filters.search.toLowerCase()
        if (
          !session.session_id.toLowerCase().includes(searchLower) &&
          !(session.agent_app_name || '').toLowerCase().includes(searchLower)
        ) {
          return false
        }
      }
      if (filters.status !== 'all' && session.status !== filters.status) {
        return false
      }
      return true
    })
  }, [sessions, filters])

  const sortedSessions = useMemo(() => {
    const sorted = [...filteredSessions]
    sorted.sort((a, b) => {
      let cmp = 0
      switch (sortBy) {
        case 'status':
          cmp = (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99)
          break
        case 'started':
          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          break
        case 'duration':
          cmp = getDurationMs(a) - getDurationMs(b)
          break
        case 'tables':
          cmp = a.eda_count - b.eda_count
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [filteredSessions, sortBy, sortDir])

  const handleSessionClick = useCallback(
    (session: ExplorationSession) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('sheet', session.session_id)
      params.set('tab', 'overview')
      router.push(`/memory?${params.toString()}`)
    },
    [router, searchParams]
  )

  const handleSheetClose = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('sheet')
    params.delete('tab')
    params.delete('tableId')
    router.push(`/memory?${params.toString()}`)
  }, [router, searchParams])

  const handleTabChange = useCallback(
    (tab: string) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('tab', tab)
      params.delete('tableId')
      router.push(`/memory?${params.toString()}`)
    },
    [router, searchParams]
  )

  if (setupLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* 1. Header */}
      <div>
        <h1 className="text-2xl font-bold">Memory</h1>
        <p className="text-muted-foreground">
          What Beton knows about your business
        </p>
      </div>

      {setupStatus && <SetupBanner setupStatus={setupStatus} />}

      {/* 2. Website Intelligence */}
      <WebsiteSection
        websiteData={websiteData}
        isLoading={websiteLoading}
        workspaceId={workspaceId}
        sessionId={latestCompletedSession?.session_id}
        isDemo={isDemo}
      />

      {/* 3. Join Candidates */}
      <JoinCandidatesSection
        session={latestCompletedSession ?? null}
        edaResults={latestEdaResults}
        workspaceId={workspaceId}
        isDemo={isDemo}
      />

      {/* 4. Schema Graph */}
      <SchemaSection
        workspaceId={workspaceId}
        session={latestCompletedSession ?? null}
        edaResults={latestEdaResults}
      />

      {/* 5. Exploration Logs */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Exploration Logs</h2>
        <ExplorationFiltersBar filters={filters} onFiltersChange={setFilters} />

        {sessionsLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sortedSessions.length > 0 ? (
          <ExplorationRunsTable
            sessions={sortedSessions}
            onSessionClick={handleSessionClick}
            sortBy={sortBy}
            sortDir={sortDir}
            onSortChange={handleSortChange}
          />
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium mb-2">No explorations yet</h3>
              <p className="text-muted-foreground">
                {sessions.length > 0
                  ? 'Try adjusting your filters to see more results.'
                  : 'Agent explorations will appear here after they run.'}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Sheet overlay — per-session drill-down */}
      <ExplorationSheet
        open={!!selectedSession}
        onOpenChange={(open) => { if (!open) handleSheetClose() }}
        session={selectedSession}
        workspaceId={workspaceId}
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />
    </div>
  )
}
