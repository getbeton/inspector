import React, { useState, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import Layout from './Layout.js'
import Table, { type TableColumn } from './ui/Table.js'
import Spinner from './ui/Spinner.js'
import { type CLIApiClient } from '../lib/api-client.js'
import { formatCurrency } from '../utils/format.js'

interface AccountsListProps {
  client: CLIApiClient
  workspace: string
  onNavigate: (view: string, data?: unknown) => void
}

interface AccountRow {
  id: string
  name: string | null
  domain: string | null
  arr: number
  plan: string
  status: string
  health_score: number
  fit_score: number
}

function getGrade(score: number): string {
  if (score >= 80) return 'M100'
  if (score >= 60) return 'M75'
  if (score >= 40) return 'M50'
  if (score >= 20) return 'M25'
  return 'M10'
}

function getGradeColor(grade: string): string {
  switch (grade) {
    case 'M100': return 'green'
    case 'M75': return 'blue'
    case 'M50': return 'yellow'
    case 'M25': return 'red'
    case 'M10': return 'redBright'
    default: return 'gray'
  }
}

export default function AccountsList({ client, workspace, onNavigate }: AccountsListProps) {
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const fetchAccounts = async (p: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await client.get<{
        accounts: AccountRow[]
        pagination?: { page: number; pages: number }
      }>('/api/accounts', { page: String(p), limit: '20' })

      setAccounts(res.accounts || [])
      setTotalPages(res.pagination?.pages || 1)
      setPage(res.pagination?.page || p)
      setSelectedIndex(0)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAccounts(page) }, [])

  useInput((input, key) => {
    if (key.escape) {
      onNavigate('dashboard')
      return
    }
    if (key.upArrow && selectedIndex > 0) setSelectedIndex(selectedIndex - 1)
    else if (key.downArrow && selectedIndex < accounts.length - 1) setSelectedIndex(selectedIndex + 1)
    else if (key.return && accounts[selectedIndex]) onNavigate('account-detail', { id: accounts[selectedIndex].id })
    else if (input === 'n' && page < totalPages) fetchAccounts(page + 1)
    else if (input === 'p' && page > 1) fetchAccounts(page - 1)
    else if (input === 'r') fetchAccounts(page)
    else if (input === 'q') process.exit(0)
  })

  const columns: TableColumn<AccountRow>[] = [
    { key: 'name', header: 'Account', width: 20, render: (r) => r.name || r.domain || '-' },
    { key: 'arr', header: 'ARR', width: 10, align: 'right', render: (r) => formatCurrency(r.arr) },
    { key: 'health_score', header: 'Health', width: 8, align: 'right', render: (r) => String(Math.round(r.health_score)) },
    { key: 'fit_score', header: 'Fit', width: 8, align: 'right', render: (r) => String(Math.round(r.fit_score)) },
    { key: 'grade', header: 'Grade', width: 6, render: (r) => getGrade(r.health_score) },
    { key: 'plan', header: 'Plan', width: 10 },
    { key: 'status', header: 'Status', width: 8 },
  ]

  if (loading) {
    return (
      <Layout workspace={workspace} title="Accounts">
        <Spinner label="Loading accounts..." />
      </Layout>
    )
  }

  if (error) {
    return (
      <Layout workspace={workspace} title="Accounts">
        <Text color="red">Error: {error}</Text>
        <Text dimColor>Press [r] to retry, [Esc] to go back</Text>
      </Layout>
    )
  }

  const activeCount = accounts.filter((a) => a.status === 'active').length
  const trialCount = accounts.filter((a) => a.status === 'trial').length
  const churnedCount = accounts.filter((a) => a.status === 'churned').length

  return (
    <Layout
      workspace={workspace}
      title={`Accounts (${accounts.length} shown)`}
      footer="[Enter] detail  [n]ext  [p]rev  [r]efresh  [Esc] back  [q]uit"
    >
      <Box marginBottom={1}>
        <Text dimColor>Active: </Text><Text color="green">{activeCount}</Text>
        <Text>  </Text>
        <Text dimColor>Trial: </Text><Text color="yellow">{trialCount}</Text>
        <Text>  </Text>
        <Text dimColor>Churned: </Text><Text color="red">{churnedCount}</Text>
      </Box>
      <Table
        columns={columns}
        data={accounts}
        selectedIndex={selectedIndex}
        page={page}
        totalPages={totalPages}
        emptyMessage="No accounts found"
      />
    </Layout>
  )
}
