'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { ExplorationStatsCards } from '@/components/exploration/exploration-stats-cards'
import { ExplorationFiltersBar, type ExplorationFilters } from '@/components/exploration/exploration-filters-bar'
import { ExplorationRunsTable } from '@/components/exploration/exploration-runs-table'
import { ExplorationSheet } from '@/components/exploration/exploration-sheet'
import { useExplorationSessions, useSessionEdaResults } from '@/lib/hooks/use-explorations'
import type { ExplorationSession } from '@/lib/api/explorations'

export default function ExplorationsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [workspaceId, setWorkspaceId] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const isDemo = !workspaceId

  // Fetch workspace context — falls through to demo mode if not logged in
  useEffect(() => {
    async function fetchWorkspace() {
      try {
        const res = await fetch('/api/workspace/setup-status')
        if (res.ok) {
          const data = await res.json()
          if (data.workspaceId) setWorkspaceId(data.workspaceId)
        }
      } catch (e) {
        console.error('Failed to fetch workspace:', e)
      } finally {
        setLoading(false)
      }
    }
    fetchWorkspace()
  }, [])

  const { data: sessions = [], isLoading: sessionsLoading } = useExplorationSessions(workspaceId)

  // Find latest completed session for aggregate stats (column count)
  const latestCompletedSession = useMemo(
    () => sessions.find(s => s.status === 'completed'),
    [sessions]
  )
  const { data: latestEdaResults = [] } = useSessionEdaResults(
    workspaceId,
    latestCompletedSession?.session_id,
  )

  const [filters, setFilters] = useState<ExplorationFilters>({
    search: '',
    status: 'all',
  })

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

  const handleSessionClick = useCallback(
    (session: ExplorationSession) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('sheet', session.session_id)
      params.set('tab', 'overview')
      router.push(`/explorations?${params.toString()}`)
    },
    [router, searchParams]
  )

  const handleSheetClose = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('sheet')
    params.delete('tab')
    params.delete('tableId')
    router.push(`/explorations?${params.toString()}`)
  }, [router, searchParams])

  const handleTabChange = useCallback(
    (tab: string) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('tab', tab)
      params.delete('tableId')
      router.push(`/explorations?${params.toString()}`)
    },
    [router, searchParams]
  )

  if (loading) {
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Explorations</h1>
          <p className="text-muted-foreground">
            Agent-powered data exploration runs
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <ExplorationStatsCards sessions={sessions} edaResults={latestEdaResults} />

      {/* Filters */}
      <ExplorationFiltersBar filters={filters} onFiltersChange={setFilters} />

      {/* Runs Table */}
      {sessionsLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredSessions.length > 0 ? (
        <ExplorationRunsTable
          sessions={filteredSessions}
          onSessionClick={handleSessionClick}
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

      {/* Exploration Sheet Overlay */}
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
