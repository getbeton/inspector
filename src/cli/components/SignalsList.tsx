import React, { useState, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import Layout from './Layout.js'
import Table, { type TableColumn } from './ui/Table.js'
import Spinner from './ui/Spinner.js'
import { type CLIApiClient } from '../lib/api-client.js'
import { formatRelativeTime } from '../utils/format.js'

interface SignalsListProps {
  client: CLIApiClient
  workspace: string
  onNavigate: (view: string, data?: unknown) => void
  initialFilters?: { source?: string; type?: string; status?: string }
}

interface SignalRow {
  id: string
  type: string
  value: number | null
  source: string | null
  timestamp: string
  account_name: string | null
  account_id: string
}

export default function SignalsList({ client, workspace, onNavigate, initialFilters }: SignalsListProps) {
  const [signals, setSignals] = useState<SignalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [pageSize] = useState(20)

  const fetchSignals = async (p: number) => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string> = {
        page: String(p),
        limit: String(pageSize),
      }
      if (initialFilters?.source) params.source = initialFilters.source
      if (initialFilters?.type) params.type = initialFilters.type

      const res = await client.get<{
        signals: Array<{
          id: string
          type: string
          value: number | null
          source: string | null
          timestamp: string
          account_id: string
          accounts?: { name: string } | null
        }>
        pagination: { page: number; limit: number; total: number; pages: number }
      }>('/api/signals', params)

      setSignals(
        res.signals.map((s) => ({
          id: s.id,
          type: s.type,
          value: s.value,
          source: s.source,
          timestamp: s.timestamp,
          account_name: s.accounts?.name || null,
          account_id: s.account_id,
        }))
      )
      setTotalPages(res.pagination.pages)
      setPage(res.pagination.page)
      setSelectedIndex(0)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchSignals(page) }, [])

  useInput((input, key) => {
    if (key.escape) {
      onNavigate('dashboard')
      return
    }
    if (key.upArrow && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1)
    } else if (key.downArrow && selectedIndex < signals.length - 1) {
      setSelectedIndex(selectedIndex + 1)
    } else if (key.return && signals[selectedIndex]) {
      onNavigate('signal-detail', { id: signals[selectedIndex].id })
    } else if (input === 'n' && page < totalPages) {
      fetchSignals(page + 1)
    } else if (input === 'p' && page > 1) {
      fetchSignals(page - 1)
    } else if (input === 'r') {
      fetchSignals(page)
    } else if (input === 'q') {
      process.exit(0)
    }
  })

  const columns: TableColumn<SignalRow>[] = [
    { key: 'type', header: 'Signal Type', width: 25 },
    { key: 'account_name', header: 'Account', width: 20, render: (r) => r.account_name || '-' },
    { key: 'value', header: 'Value', width: 8, align: 'right', render: (r) => r.value !== null ? String(r.value) : '-' },
    { key: 'source', header: 'Source', width: 12, render: (r) => r.source || '-' },
    { key: 'timestamp', header: 'Time', width: 12, render: (r) => formatRelativeTime(r.timestamp) },
  ]

  if (loading) {
    return (
      <Layout workspace={workspace} title="Signals">
        <Spinner label="Loading signals..." />
      </Layout>
    )
  }

  if (error) {
    return (
      <Layout workspace={workspace} title="Signals">
        <Text color="red">Error: {error}</Text>
        <Text dimColor>Press [r] to retry, [Esc] to go back</Text>
      </Layout>
    )
  }

  return (
    <Layout
      workspace={workspace}
      title={`Signals (${signals.length} shown)`}
      footer="[Enter] detail  [n]ext  [p]rev  [r]efresh  [Esc] back  [q]uit"
    >
      <Table
        columns={columns}
        data={signals}
        selectedIndex={selectedIndex}
        page={page}
        totalPages={totalPages}
        emptyMessage="No signals found"
      />
    </Layout>
  )
}
