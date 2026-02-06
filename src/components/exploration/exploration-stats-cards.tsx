'use client'

import { useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import type { ExplorationSession } from '@/lib/api/explorations'
import type { EdaResult } from '@/lib/agent/types'

interface ExplorationStatsCardsProps {
  sessions: ExplorationSession[]
  edaResults?: EdaResult[]
}

export function ExplorationStatsCards({ sessions, edaResults = [] }: ExplorationStatsCardsProps) {
  const stats = useMemo(() => {
    const totalRuns = sessions.length
    const tablesDiscovered = sessions.reduce((sum, s) => sum + s.eda_count, 0)

    // Count unique join pairs across all sessions with confirmed joins
    const joinPairs = sessions.reduce((sum, s) => {
      return sum + (s.confirmed_joins?.length || 0)
    }, 0)

    // Count total columns from EDA results' table_stats
    const totalColumns = edaResults.reduce((sum, r) => {
      const stats = r.table_stats as Record<string, any> | null
      const cols = stats?.columns as any[] | undefined
      return sum + (cols?.length || 0)
    }, 0)

    return { totalRuns, tablesDiscovered, joinPairs, totalColumns }
  }, [sessions, edaResults])

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="pt-6">
          <div className="text-2xl font-bold">{stats.totalRuns}</div>
          <p className="text-sm text-muted-foreground">Total Runs</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="text-2xl font-bold">{stats.tablesDiscovered}</div>
          <p className="text-sm text-muted-foreground">Tables Discovered</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="text-2xl font-bold">{stats.joinPairs}</div>
          <p className="text-sm text-muted-foreground">Join Pairs</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="text-2xl font-bold">{stats.totalColumns}</div>
          <p className="text-sm text-muted-foreground">Columns</p>
        </CardContent>
      </Card>
    </div>
  )
}
