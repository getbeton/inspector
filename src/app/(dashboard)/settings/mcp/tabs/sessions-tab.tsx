'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { CopyButton } from '@/components/ui/copy-button'
import { useMcpSessions } from '@/lib/hooks/use-mcp-sessions'
import type { McpSession } from '@/lib/api/mcp-sessions'
import SessionDetailSheet from './session-detail-sheet'
import { statusBadge, formatTimestamp, formatDuration } from './session-helpers'

// ---------------------------------------------------------------------------
// Sessions Tab
// ---------------------------------------------------------------------------

export default function SessionsTab() {
  const { data: sessions, isLoading, error } = useMcpSessions()
  const [selectedSession, setSelectedSession] = useState<McpSession | null>(null)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="size-5" />
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-destructive">
            Failed to load sessions. Please try again.
          </p>
        </CardContent>
      </Card>
    )
  }

  const INTERNAL_AGENTS = ['upsell_agent']
  const externalSessions = sessions?.filter(
    (s) => !INTERNAL_AGENTS.includes(s.agent_app_name)
  ) ?? []

  if (externalSessions.length === 0) {
    return <EmptyState />
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>MCP Agent Sessions</CardTitle>
            <Badge variant="outline" size="sm">{externalSessions.length}</Badge>
          </div>
          <CardDescription>
            External agent sessions connected via MCP.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 pr-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Session ID
                  </th>
                  <th className="pb-2 pr-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Agent
                  </th>
                  <th className="pb-2 pr-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Status
                  </th>
                  <th className="pb-2 pr-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Started
                  </th>
                  <th className="pb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Duration
                  </th>
                </tr>
              </thead>
              <tbody>
                {externalSessions.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    onSelect={() => setSelectedSession(session)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <SessionDetailSheet
        session={selectedSession}
        open={!!selectedSession}
        onOpenChange={(open) => {
          if (!open) setSelectedSession(null)
        }}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Session Row
// ---------------------------------------------------------------------------

function SessionRow({
  session,
  onSelect,
}: {
  session: McpSession
  onSelect: () => void
}) {
  const badge = statusBadge(session.status)
  const truncatedId = session.session_id.length > 16
    ? `${session.session_id.slice(0, 8)}...${session.session_id.slice(-4)}`
    : session.session_id

  return (
    <tr
      className="border-b border-border/50 last:border-0 cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={onSelect}
    >
      <td className="py-2.5 pr-4">
        <span className="flex items-center gap-1.5">
          <code className="text-xs font-mono" title={session.session_id}>
            {truncatedId}
          </code>
          <CopyButton
            value={session.session_id}
            size="sm"
          />
        </span>
      </td>
      <td className="py-2.5 pr-4 text-xs">
        {session.agent_app_name || '—'}
      </td>
      <td className="py-2.5 pr-4">
        <Badge variant={badge.variant} size="sm">
          {badge.dot && (
            <span className={`inline-block size-1.5 rounded-full ${badge.dot}`} />
          )}
          {badge.label}
        </Badge>
      </td>
      <td className="py-2.5 pr-4 text-xs text-muted-foreground">
        {session.started_at ? formatTimestamp(session.started_at) : '—'}
      </td>
      <td className="py-2.5 text-xs text-muted-foreground">
        {formatDuration(session.started_at, session.completed_at)}
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

function EmptyState() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const goToSetup = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', 'setup')
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-4">
        <div className="space-y-1.5">
          <p className="text-sm font-medium">No MCP sessions yet</p>
          <p className="text-sm text-muted-foreground max-w-md">
            Connect an AI agent using the setup instructions to get started.
            Sessions will appear here once an agent connects.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={goToSetup}>
          View Setup Instructions
        </Button>
      </CardContent>
    </Card>
  )
}
