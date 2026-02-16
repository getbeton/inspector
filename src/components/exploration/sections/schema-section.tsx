'use client'

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { SchemaGraphTab } from '../tabs/schema-graph-tab'
import type { ExplorationSession } from '@/lib/api/explorations'
import type { EdaResult } from '@/lib/agent/types'

interface SchemaSectionProps {
  workspaceId: string | undefined
  session?: ExplorationSession | null
  edaResults: EdaResult[]
}

export function SchemaSection({ workspaceId, session, edaResults }: SchemaSectionProps) {
  if (edaResults.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Schema Graph</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-4">
            No schema data yet. Complete an exploration to see the graph.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Schema Graph</CardTitle>
      </CardHeader>
      <CardContent className="p-0 h-[500px]">
        <SchemaGraphTab
          workspaceId={workspaceId}
          session={session ?? undefined}
          edaResults={edaResults}
        />
      </CardContent>
    </Card>
  )
}
