import React, { useState, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import Layout from './Layout.js'
import Table, { type TableColumn } from './ui/Table.js'
import Spinner from './ui/Spinner.js'
import { type CLIApiClient } from '../lib/api-client.js'
import { formatRelativeTime } from '../utils/format.js'

interface McpSessionsProps {
  client: CLIApiClient
  workspace: string
  onNavigate: (view: string, data?: unknown) => void
  sessionId?: string
}

interface McpSession {
  id: string
  client_app: string
  status: 'active' | 'closed' | string
  started_at: string
  ended_at: string | null
  request_count: number
  last_activity_at: string | null
}

interface McpLog {
  id: string
  timestamp: string
  tool: string
  status: number
  duration_ms: number
  request_body?: unknown
  response_body?: unknown
}

export default function McpSessions({ client, workspace, onNavigate, sessionId }: McpSessionsProps) {
  const [sessions, setSessions] = useState<McpSession[]>([])
  const [logs, setLogs] = useState<McpLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [viewMode, setViewMode] = useState<'sessions' | 'logs'>(sessionId ? 'logs' : 'sessions')
  const [activeSessionId, setActiveSessionId] = useState<string | null>(sessionId || null)

  const fetchSessions = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await client.get<{ sessions: McpSession[] }>('/api/agent/sessions')
      setSessions(res.sessions || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const fetchLogs = async (sid: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await client.get<{ logs: McpLog[] }>('/api/mcp/logs', { session: sid })
      setLogs(res.logs || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (viewMode === 'sessions') fetchSessions()
    else if (activeSessionId) fetchLogs(activeSessionId)
  }, [viewMode, activeSessionId])

  useInput((input, key) => {
    if (key.escape) {
      if (viewMode === 'logs') {
        setViewMode('sessions')
        setActiveSessionId(null)
        setSelectedIndex(0)
      } else {
        onNavigate('dashboard')
      }
      return
    }
    if (key.upArrow && selectedIndex > 0) setSelectedIndex(selectedIndex - 1)
    else if (key.downArrow) {
      const max = viewMode === 'sessions' ? sessions.length - 1 : logs.length - 1
      if (selectedIndex < max) setSelectedIndex(selectedIndex + 1)
    }
    else if (key.return && viewMode === 'sessions' && sessions[selectedIndex]) {
      setActiveSessionId(sessions[selectedIndex].id)
      setViewMode('logs')
      setSelectedIndex(0)
    }
    else if (input === 'r') {
      if (viewMode === 'sessions') fetchSessions()
      else if (activeSessionId) fetchLogs(activeSessionId)
    }
    else if (input === 'q') process.exit(0)
  })

  if (loading) {
    return (
      <Layout workspace={workspace} title="MCP Sessions">
        <Spinner label={viewMode === 'sessions' ? 'Loading sessions...' : 'Loading logs...'} />
      </Layout>
    )
  }

  if (error) {
    return (
      <Layout workspace={workspace} title="MCP Sessions">
        <Text color="red">Error: {error}</Text>
        <Text dimColor>Press [r] to retry, [Esc] to go back</Text>
      </Layout>
    )
  }

  if (viewMode === 'logs') {
    const logColumns: TableColumn<McpLog>[] = [
      { key: 'timestamp', header: 'Time', width: 12, render: (r) => formatRelativeTime(r.timestamp) },
      { key: 'tool', header: 'Tool', width: 25 },
      { key: 'status', header: 'Status', width: 8, render: (r) => String(r.status) },
      { key: 'duration_ms', header: 'Duration', width: 10, render: (r) => `${r.duration_ms}ms` },
    ]

    return (
      <Layout
        workspace={workspace}
        title={`Session: ${activeSessionId}`}
        footer="[r]efresh  [Esc] back to sessions  [q]uit"
      >
        <Table
          columns={logColumns}
          data={logs}
          selectedIndex={selectedIndex}
          emptyMessage="No logs for this session"
        />
      </Layout>
    )
  }

  const activeSessions = sessions.filter((s) => s.status === 'active')
  const recentSessions = sessions.filter((s) => s.status !== 'active')

  const sessionColumns: TableColumn<McpSession>[] = [
    { key: 'client_app', header: 'Client App', width: 18, render: (r) => r.client_app || '-' },
    { key: 'id', header: 'Session ID', width: 16, render: (r) => r.id.slice(0, 14) },
    { key: 'status', header: 'Status', width: 10 },
    { key: 'last_activity_at', header: 'Last Activity', width: 14, render: (r) => r.last_activity_at ? formatRelativeTime(r.last_activity_at) : '-' },
    { key: 'request_count', header: 'Requests', width: 10, render: (r) => String(r.request_count || 0) },
  ]

  return (
    <Layout
      workspace={workspace}
      title="MCP Sessions"
      footer="[Enter] view logs  [r]efresh  [Esc] back  [q]uit"
    >
      {activeSessions.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="green">ACTIVE SESSIONS</Text>
          <Table columns={sessionColumns} data={activeSessions} selectedIndex={selectedIndex < activeSessions.length ? selectedIndex : undefined} />
        </Box>
      )}

      {recentSessions.length > 0 && (
        <Box flexDirection="column">
          <Text bold dimColor>RECENT SESSIONS</Text>
          <Table
            columns={sessionColumns}
            data={recentSessions}
            selectedIndex={selectedIndex >= activeSessions.length ? selectedIndex - activeSessions.length : undefined}
          />
        </Box>
      )}

      {sessions.length === 0 && <Text dimColor>No MCP sessions found</Text>}
    </Layout>
  )
}
