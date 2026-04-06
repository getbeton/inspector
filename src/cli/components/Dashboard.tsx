import React, { useState, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import Layout from './Layout.js'
import MetricCard from './ui/MetricCard.js'
import Table, { type TableColumn } from './ui/Table.js'
import Spinner from './ui/Spinner.js'
import { type CLIApiClient } from '../lib/api-client.js'
import { formatCurrency, formatLift, formatPercent, formatRelativeTime } from '../utils/format.js'

interface DashboardProps {
  client: CLIApiClient
  workspace: string
  onNavigate: (view: string) => void
}

interface DashboardMetrics {
  signals: { active: number; total: number; avg_lift: number; leads_per_month: number; estimated_arr: number }
  accounts: { total: number; healthy: number; at_risk: number; churned: number }
  integrations: Array<{ name: string; display_name: string; is_connected: boolean; category: string }>
  billing?: { plan: string; mtu_current: number; mtu_limit: number }
  recent_signals: Array<{ id: string; type: string; value: number | null; timestamp: string; source: string | null; accounts?: { name: string } | null }>
}

export default function Dashboard({ client, workspace, onNavigate }: DashboardProps) {
  const [data, setData] = useState<DashboardMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [metricsRes, integrationsRes, signalsRes] = await Promise.allSettled([
        client.get<Record<string, unknown>>('/api/signals/dashboard/metrics'),
        client.get<{ integrations: DashboardMetrics['integrations'] }>('/api/integrations'),
        client.get<{ signals: DashboardMetrics['recent_signals']; pagination: unknown }>('/api/signals', { limit: '10' }),
      ])

      const metrics = metricsRes.status === 'fulfilled' ? metricsRes.value as Record<string, unknown> : {}
      const integrations = integrationsRes.status === 'fulfilled' ? integrationsRes.value.integrations : []
      const signals = signalsRes.status === 'fulfilled' ? signalsRes.value.signals : []

      let billing: DashboardMetrics['billing'] | undefined
      try {
        billing = await client.get<DashboardMetrics['billing']>('/api/billing/status')
      } catch {
        // billing endpoint is optional
      }

      setData({
        signals: {
          active: (metrics.active_count as number) || 0,
          total: (metrics.total_count as number) || 0,
          avg_lift: (metrics.avg_lift as number) || 0,
          leads_per_month: (metrics.leads_per_month as number) || 0,
          estimated_arr: (metrics.estimated_arr as number) || 0,
        },
        accounts: {
          total: (metrics.total_accounts as number) || 0,
          healthy: (metrics.healthy_accounts as number) || 0,
          at_risk: (metrics.at_risk_accounts as number) || 0,
          churned: (metrics.churned_accounts as number) || 0,
        },
        integrations,
        billing,
        recent_signals: signals,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  useInput((input, key) => {
    if (input === 's') onNavigate('signals')
    else if (input === 'a') onNavigate('accounts')
    else if (input === 'i') onNavigate('integrations')
    else if (input === 'p') onNavigate('mcp')
    else if (input === 'k') onNavigate('keys')
    else if (input === 'r') fetchData()
    else if (input === 'q') process.exit(0)
  })

  if (loading) {
    return (
      <Layout workspace={workspace}>
        <Spinner label="Loading dashboard..." />
      </Layout>
    )
  }

  if (error) {
    return (
      <Layout workspace={workspace}>
        <Text color="red">Error: {error}</Text>
        <Text dimColor>Press [r] to retry</Text>
      </Layout>
    )
  }

  if (!data) return null

  const signalColumns: TableColumn<(typeof data.recent_signals)[0]>[] = [
    { key: 'type', header: 'Signal Type', width: 25 },
    {
      key: 'account',
      header: 'Account',
      width: 20,
      render: (row) => row.accounts?.name || '-',
    },
    {
      key: 'value',
      header: 'Value',
      width: 8,
      align: 'right',
      render: (row) => row.value !== null ? String(row.value) : '-',
    },
    { key: 'source', header: 'Source', width: 12, render: (row) => row.source || '-' },
    {
      key: 'timestamp',
      header: 'Time',
      width: 12,
      render: (row) => formatRelativeTime(row.timestamp),
    },
  ]

  const connectedCount = data.integrations.filter((i) => i.is_connected).length

  return (
    <Layout workspace={workspace} footer="[s]ignals  [a]ccounts  [i]ntegrations  mc[p]  [k]eys  [r]efresh  [q]uit">
      {/* Metric cards row */}
      <Box>
        <MetricCard
          label="SIGNALS"
          value={`Active: ${data.signals.active}`}
          sublabel={`Lift: ${formatLift(data.signals.avg_lift)}  Leads: ${data.signals.leads_per_month}/mo`}
          color="cyan"
          width={22}
        />
        <MetricCard
          label="ACCOUNTS"
          value={`Total: ${data.accounts.total}`}
          sublabel={`Healthy: ${data.accounts.healthy}  At Risk: ${data.accounts.at_risk}`}
          color="green"
          width={22}
        />
        <MetricCard
          label="INTEGRATIONS"
          value={`${connectedCount}/${data.integrations.length} connected`}
          sublabel={data.integrations.filter((i) => i.is_connected).map((i) => i.display_name || i.name).join(', ') || 'None'}
          color="blue"
          width={22}
        />
        {data.billing && (
          <MetricCard
            label="BILLING"
            value={data.billing.plan || 'Free'}
            sublabel={`MTU: ${data.billing.mtu_current}/${data.billing.mtu_limit}`}
            color="yellow"
            width={16}
          />
        )}
      </Box>

      {/* Recent Signals */}
      <Box marginTop={1} flexDirection="column">
        <Text bold>RECENT SIGNALS</Text>
        <Table
          columns={signalColumns}
          data={data.recent_signals}
          emptyMessage="No signals detected yet"
        />
      </Box>
    </Layout>
  )
}
