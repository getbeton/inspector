import React, { useState, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import Layout from './Layout.js'
import MetricCard from './ui/MetricCard.js'
import BarChart from './ui/BarChart.js'
import Spinner from './ui/Spinner.js'
import { type CLIApiClient } from '../lib/api-client.js'
import { formatNumber, formatPercent, formatCurrency, formatRelativeTime, formatDate } from '../utils/format.js'

interface SignalDetailProps {
  client: CLIApiClient
  workspace: string
  signalId: string
  onNavigate: (view: string, data?: unknown) => void
}

interface SignalData {
  signal: {
    id: string
    type: string
    value: number | null
    details: Record<string, unknown>
    timestamp: string
    source: string | null
    created_at: string
    accounts?: { id: string; name: string; domain: string | null; arr: number | null; health_score: number | null } | null
  }
  metrics: {
    total_count: number
    count_7d: number
    count_30d: number
    lift: number | null
    conversion_rate: number | null
    confidence: number | null
    sample_size: number | null
    calculated_at: string | null
  } | null
  related_signals: Array<{ id: string; type: string; value: number | null; timestamp: string; source: string | null }>
  scores: Array<{ score_type: string; score_value: number; calculated_at: string }>
}

export default function SignalDetail({ client, workspace, signalId, onNavigate }: SignalDetailProps) {
  const [data, setData] = useState<SignalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await client.get<SignalData>(`/api/signals/${signalId}`)
      setData(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [signalId])

  useInput((input, key) => {
    if (key.escape) {
      onNavigate('signals')
      return
    }
    if (input === 'r') fetchData()
    if (input === 'q') process.exit(0)
    if (input === 'd') {
      // Delete would need confirmation - simplified
      onNavigate('signals')
    }
  })

  if (loading) {
    return (
      <Layout workspace={workspace} title="Signal Detail">
        <Spinner label="Loading signal..." />
      </Layout>
    )
  }

  if (error || !data) {
    return (
      <Layout workspace={workspace} title="Signal Detail">
        <Text color="red">Error: {error || 'Signal not found'}</Text>
        <Text dimColor>Press [Esc] to go back</Text>
      </Layout>
    )
  }

  const { signal, metrics, related_signals, scores } = data

  return (
    <Layout
      workspace={workspace}
      title={`Signal: ${signal.type}`}
      footer="[d]elete  [r]efresh  [Esc] back  [q]uit"
    >
      {/* Basic info */}
      <Box flexDirection="column">
        <Box>
          <Text dimColor>Type: </Text><Text bold>{signal.type}</Text>
          <Text>   </Text>
          <Text dimColor>Source: </Text><Text>{signal.source || '-'}</Text>
          <Text>   </Text>
          <Text dimColor>Created: </Text><Text>{formatDate(signal.created_at, 'iso')}</Text>
        </Box>
        {signal.accounts && (
          <Box>
            <Text dimColor>Account: </Text>
            <Text bold color="cyan">{signal.accounts.name}</Text>
            {signal.accounts.domain && <Text dimColor> ({signal.accounts.domain})</Text>}
            {signal.accounts.arr !== null && <Text>  ARR: {formatCurrency(signal.accounts.arr)}</Text>}
          </Box>
        )}
        {signal.value !== null && (
          <Box>
            <Text dimColor>Value: </Text><Text bold>{signal.value}</Text>
          </Box>
        )}
      </Box>

      {/* Metrics */}
      {metrics && (
        <Box marginTop={1} flexDirection="column">
          <Text bold>METRICS</Text>
          <Box>
            <MetricCard label="Total (all)" value={formatNumber(metrics.total_count)} width={16} />
            <MetricCard label="Last 30d" value={formatNumber(metrics.count_30d)} width={16} />
            <MetricCard label="Last 7d" value={formatNumber(metrics.count_7d)} width={16} />
            {metrics.lift !== null && (
              <MetricCard label="Lift" value={`${metrics.lift.toFixed(1)}x`} color="green" width={16} />
            )}
          </Box>
          <Box>
            {metrics.confidence !== null && (
              <MetricCard label="Confidence" value={formatPercent(metrics.confidence)} width={16} />
            )}
            {metrics.conversion_rate !== null && (
              <MetricCard label="Conv. Rate" value={formatPercent(metrics.conversion_rate)} width={16} />
            )}
            {metrics.sample_size !== null && (
              <MetricCard label="Sample Size" value={formatNumber(metrics.sample_size)} width={16} />
            )}
          </Box>
        </Box>
      )}

      {/* Conversion comparison */}
      {metrics?.conversion_rate !== null && metrics?.conversion_rate !== undefined && (
        <Box marginTop={1} flexDirection="column">
          <Text bold>CONVERSION COMPARISON</Text>
          <BarChart
            label="With signal:   "
            value={Math.round((metrics.conversion_rate || 0) * 100)}
            maxValue={100}
            width={30}
            color="green"
          />
          <BarChart
            label="Without signal:"
            value={Math.round(((metrics.conversion_rate || 0) / (metrics.lift || 1)) * 100)}
            maxValue={100}
            width={30}
            color="gray"
          />
        </Box>
      )}

      {/* Account scores */}
      {scores.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold>ACCOUNT SCORES</Text>
          {scores.map((score, i) => (
            <Box key={i}>
              <Text dimColor>{score.score_type.padEnd(14)}</Text>
              <BarChart
                value={Math.round(score.score_value)}
                maxValue={100}
                width={20}
                color={score.score_value >= 60 ? 'green' : score.score_value >= 40 ? 'yellow' : 'red'}
              />
            </Box>
          ))}
        </Box>
      )}

      {/* Related signals */}
      {related_signals.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold>RELATED SIGNALS ({related_signals.length})</Text>
          {related_signals.slice(0, 5).map((rs, i) => (
            <Box key={i}>
              <Text dimColor>{(i + 1).toString().padStart(2)}. </Text>
              <Text>{rs.type.padEnd(25)}</Text>
              <Text dimColor>{formatRelativeTime(rs.timestamp)}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Details JSON */}
      {Object.keys(signal.details || {}).length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold>DETAILS</Text>
          <Text dimColor>{JSON.stringify(signal.details, null, 2)}</Text>
        </Box>
      )}
    </Layout>
  )
}
