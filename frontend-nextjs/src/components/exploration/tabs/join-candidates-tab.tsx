'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { JoinPairRow } from '../join-editor/join-pair-row'
import { useSessionEdaResults, useSaveConfirmedJoins } from '@/lib/hooks/use-explorations'
import type { ExplorationSession, JoinPair } from '@/lib/api/explorations'

interface JoinCandidatesTabProps {
  workspaceId: string
  session: ExplorationSession
}

const EMPTY_PAIR: JoinPair = { table1: '', col1: '', table2: '', col2: '' }

export function JoinCandidatesTab({ workspaceId, session }: JoinCandidatesTabProps) {
  const { data: edaResults = [] } = useSessionEdaResults(workspaceId, session.session_id)
  const saveMutation = useSaveConfirmedJoins(session.session_id)

  const [isEditing, setIsEditing] = useState(false)
  const [draftPairs, setDraftPairs] = useState<JoinPair[]>([])

  // Collect all table IDs from EDA results
  const tableIds = useMemo(
    () => edaResults.map(r => r.table_id).sort(),
    [edaResults]
  )

  // Aggregate all suggested joins from EDA results
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

  // Initialize draft from confirmed joins or suggested joins
  useEffect(() => {
    if (session.confirmed_joins && session.confirmed_joins.length > 0) {
      setDraftPairs(session.confirmed_joins)
    } else {
      setDraftPairs(suggestedJoins)
    }
  }, [session.confirmed_joins, suggestedJoins])

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
    // Filter out incomplete pairs
    const validPairs = draftPairs.filter(
      p => p.table1 && p.col1 && p.table2 && p.col2
    )
    await saveMutation.mutateAsync(validPairs)
    setIsEditing(false)
  }

  const handleCancel = () => {
    if (session.confirmed_joins && session.confirmed_joins.length > 0) {
      setDraftPairs(session.confirmed_joins)
    } else {
      setDraftPairs(suggestedJoins)
    }
    setIsEditing(false)
  }

  const hasConfirmed = session.confirmed_joins && session.confirmed_joins.length > 0
  const displayPairs = isEditing ? draftPairs : (hasConfirmed ? session.confirmed_joins! : suggestedJoins)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
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
      </div>

      {/* Join Pairs */}
      {displayPairs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No join candidates found. {isEditing ? 'Add a pair below.' : 'Click Edit to add joins manually.'}
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

      {/* Add Pair Button (edit mode only) */}
      {isEditing && (
        <button
          onClick={handleAddPair}
          className="w-full border-2 border-dashed border-muted-foreground/30 rounded-lg p-2 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
        >
          + Add Join Pair
        </button>
      )}
    </div>
  )
}
