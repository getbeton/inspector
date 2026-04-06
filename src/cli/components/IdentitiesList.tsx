import React, { useState, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import Layout from './Layout.js'
import Table, { type TableColumn } from './ui/Table.js'
import Spinner from './ui/Spinner.js'
import { type CLIApiClient } from '../lib/api-client.js'
import { formatRelativeTime, formatNumber } from '../utils/format.js'

interface IdentitiesListProps {
  client: CLIApiClient
  workspace: string
  onNavigate: (view: string, data?: unknown) => void
}

interface IdentityRow {
  id: string
  email: string | null
  name: string | null
  company: string | null
  score: number
  events_count: number
  signals_count: number
  status: string
  last_seen_at: string | null
}

export default function IdentitiesList({ client, workspace, onNavigate }: IdentitiesListProps) {
  const [identities, setIdentities] = useState<IdentityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const fetchData = async (p: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await client.get<{
        identities?: IdentityRow[]
        contacts?: IdentityRow[]
        pagination?: { page: number; pages: number }
      }>('/api/identities', { page: String(p), limit: '20' })

      // API might return identities or contacts key
      const data = res.identities || res.contacts || []
      setIdentities(data)
      setTotalPages(res.pagination?.pages || 1)
      setPage(res.pagination?.page || p)
      setSelectedIndex(0)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData(page) }, [])

  useInput((input, key) => {
    if (key.escape) { onNavigate('dashboard'); return }
    if (key.upArrow && selectedIndex > 0) setSelectedIndex(selectedIndex - 1)
    else if (key.downArrow && selectedIndex < identities.length - 1) setSelectedIndex(selectedIndex + 1)
    else if (input === 'n' && page < totalPages) fetchData(page + 1)
    else if (input === 'p' && page > 1) fetchData(page - 1)
    else if (input === 'r') fetchData(page)
    else if (input === 'q') process.exit(0)
  })

  const columns: TableColumn<IdentityRow>[] = [
    { key: 'email', header: 'Identity', width: 25, render: (r) => r.email || r.name || '-' },
    { key: 'company', header: 'Company', width: 18, render: (r) => r.company || '-' },
    { key: 'score', header: 'Score', width: 7, align: 'right', render: (r) => String(Math.round(r.score || 0)) },
    { key: 'events_count', header: 'Events', width: 8, align: 'right', render: (r) => formatNumber(r.events_count || 0) },
    { key: 'signals_count', header: 'Signals', width: 8, align: 'right', render: (r) => String(r.signals_count || 0) },
    { key: 'status', header: 'Status', width: 10 },
    { key: 'last_seen_at', header: 'Last Seen', width: 12, render: (r) => r.last_seen_at ? formatRelativeTime(r.last_seen_at) : '-' },
  ]

  if (loading) {
    return (
      <Layout workspace={workspace} title="Identities">
        <Spinner label="Loading identities..." />
      </Layout>
    )
  }

  if (error) {
    return (
      <Layout workspace={workspace} title="Identities">
        <Text color="red">Error: {error}</Text>
        <Text dimColor>Press [r] to retry, [Esc] to go back</Text>
      </Layout>
    )
  }

  return (
    <Layout
      workspace={workspace}
      title={`Identities (${identities.length} shown)`}
      footer="[n]ext  [p]rev  [r]efresh  [Esc] back  [q]uit"
    >
      <Table
        columns={columns}
        data={identities}
        selectedIndex={selectedIndex}
        page={page}
        totalPages={totalPages}
        emptyMessage="No identities found"
      />
    </Layout>
  )
}
