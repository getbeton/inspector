'use client'

import { useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import type { ExplorationSession } from '@/lib/api/explorations'

interface ExplorationStatsCardsProps {
  sessions: ExplorationSession[]
}

export function ExplorationStatsCards({ sessions }: ExplorationStatsCardsProps) {
  const stats = useMemo(() => {
    const totalRuns = sessions.length
    const tablesDiscovered = sessions.reduce((sum, s) => sum + s.eda_count, 0)
    const completed = sessions.filter(s => s.status === 'completed').length
    const completionRate = totalRuns > 0 ? Math.round((completed / totalRuns) * 100) : 0

    // Count unique join pairs across all sessions with confirmed joins
    const joinPairs = sessions.reduce((sum, s) => {
      return sum + (s.confirmed_joins?.length || 0)
    }, 0)

    return { totalRuns, tablesDiscovered, joinPairs, completionRate }
  }, [sessions])

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
          <div className="text-2xl font-bold">{stats.completionRate}%</div>
          <p className="text-sm text-muted-foreground">Completion Rate</p>
        </CardContent>
      </Card>
    </div>
  )
}
