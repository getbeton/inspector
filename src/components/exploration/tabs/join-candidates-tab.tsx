'use client'

import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { useSessionEdaResults } from '@/lib/hooks/use-explorations'
import type { ExplorationSession, JoinPair } from '@/lib/api/explorations'

interface JoinCandidatesTabProps {
  workspaceId: string | undefined
  session: ExplorationSession
}

export function JoinCandidatesTab({ workspaceId, session }: JoinCandidatesTabProps) {
  const { data: edaResults = [] } = useSessionEdaResults(workspaceId, session.id)

  const suggestedJoins = useMemo(() => {
    const joins: JoinPair[] = []
    const seen = new Set<string>()
    for (const result of edaResults) {
      if (result.join_suggestions) {
        for (const j of result.join_suggestions) {
          const key = `${j.table1}:${j.col1}:${j.table2}:${j.col2}`
          if (!seen.has(key)) {
            seen.add(key)
            joins.push(j)
          }
        }
      }
    }
    return joins
  }, [edaResults])

  const hasConfirmed = session.confirmed_joins && session.confirmed_joins.length > 0
  const displayPairs = hasConfirmed ? session.confirmed_joins! : suggestedJoins

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-medium">
          {hasConfirmed ? 'Confirmed Joins' : 'Suggested Joins'}
        </h4>
        {hasConfirmed && (
          <Badge variant="success" size="sm">Confirmed</Badge>
        )}
        {!hasConfirmed && suggestedJoins.length > 0 && (
          <Badge variant="warning" size="sm">Suggested</Badge>
        )}
      </div>

      {/* Join Pairs */}
      {displayPairs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No join candidates found.
        </div>
      ) : (
        <div className="space-y-2">
          {displayPairs.map((pair, i) => (
            <div key={i} className="flex items-center gap-2 text-sm border rounded-lg px-3 py-2">
              <span className="font-mono">{pair.table1}</span>
              <span className="text-muted-foreground">.</span>
              <span className="font-mono text-primary">{pair.col1}</span>
              <span className="mx-2 text-muted-foreground">=</span>
              <span className="font-mono">{pair.table2}</span>
              <span className="text-muted-foreground">.</span>
              <span className="font-mono text-primary">{pair.col2}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
