'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardHeader, CardTitle, CardAction, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { JoinPairRow } from '../join-editor/join-pair-row'
import { useSaveConfirmedJoins } from '@/lib/hooks/use-explorations'
import type { ExplorationSession, JoinPair } from '@/lib/api/explorations'
import type { EdaResult } from '@/lib/agent/types'

interface JoinCandidatesSectionProps {
  session: ExplorationSession | null
  edaResults: EdaResult[]
  workspaceId: string | undefined
  isDemo: boolean
}

const EMPTY_PAIR: JoinPair = { table1: '', col1: '', table2: '', col2: '' }

export function JoinCandidatesSection({
  session,
  edaResults,
  workspaceId,
  isDemo,
}: JoinCandidatesSectionProps) {
  const saveMutation = useSaveConfirmedJoins(session?.session_id ?? '')

  const [isEditing, setIsEditing] = useState(false)
  const [draftPairs, setDraftPairs] = useState<JoinPair[]>([])

  const tableIds = useMemo(
    () => edaResults.map(r => r.table_id).sort(),
    [edaResults]
  )

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

  useEffect(() => {
    if (session?.confirmed_joins && session.confirmed_joins.length > 0) {
      setDraftPairs(session.confirmed_joins)
    } else {
      setDraftPairs(suggestedJoins)
    }
  }, [session?.confirmed_joins, suggestedJoins])

  const handlePairChange = (index: number, updated: JoinPair) => {
    setDraftPairs(prev => prev.map((p, i) => (i === index ? updated : p)))
  }

  const handlePairRemove = (index: number) => {
    setDraftPairs(prev => prev.filter((_, i) => i !== index))
  }

  const handleAddPair = () => {
    setDraftPairs(prev => [...prev, { ...EMPTY_PAIR }])
  }

  const handleSave = async () => {
    const validPairs = draftPairs.filter(
      p => p.table1 && p.col1 && p.table2 && p.col2
    )
    await saveMutation.mutateAsync(validPairs)
    setIsEditing(false)
  }

  const handleCancel = () => {
    if (session?.confirmed_joins && session.confirmed_joins.length > 0) {
      setDraftPairs(session.confirmed_joins)
    } else {
      setDraftPairs(suggestedJoins)
    }
    setIsEditing(false)
  }

  const canEdit = !isDemo && !!session

  if (!session) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Join Candidates</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-4">
            No join candidates yet.
          </p>
        </CardContent>
      </Card>
    )
  }

  const hasConfirmed = session.confirmed_joins && session.confirmed_joins.length > 0
  const displayPairs = isEditing ? draftPairs : (hasConfirmed ? session.confirmed_joins! : suggestedJoins)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>Join Candidates</CardTitle>
          {hasConfirmed && (
            <Badge variant="success" size="sm">Confirmed</Badge>
          )}
          {!hasConfirmed && suggestedJoins.length > 0 && (
            <Badge variant="warning" size="sm">Suggested</Badge>
          )}
        </div>
        {canEdit && (
          <CardAction>
            {!isEditing ? (
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                Edit
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleCancel}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? 'Saving…' : 'Confirm Joins'}
                </Button>
              </div>
            )}
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {displayPairs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No join candidates found.
          </div>
        ) : (
          <div className="space-y-2">
            {isEditing
              ? draftPairs.map((pair, i) => (
                  <JoinPairRow
                    key={i}
                    pair={pair}
                    index={i}
                    tableIds={tableIds}
                    workspaceId={workspaceId}
                    onChange={handlePairChange}
                    onRemove={handlePairRemove}
                  />
                ))
              : displayPairs.map((pair, i) => (
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

        {isEditing && (
          <button
            onClick={handleAddPair}
            className="w-full mt-3 border-2 border-dashed border-muted-foreground/30 rounded-lg p-2 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
          >
            + Add Join Pair
          </button>
        )}
      </CardContent>
    </Card>
  )
}
