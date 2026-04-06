import React, { useState, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import Layout from './Layout.js'
import MetricCard from './ui/MetricCard.js'
import BarChart from './ui/BarChart.js'
import Spinner from './ui/Spinner.js'
import { type CLIApiClient } from '../lib/api-client.js'
import { formatCurrency, formatRelativeTime } from '../utils/format.js'

interface AccountDetailProps {
  client: CLIApiClient
  workspace: string
  accountId: string
  onNavigate: (view: string, data?: unknown) => void
}

interface AccountData {
  id: string
  name: string | null
  domain: string | null
  arr: number
  plan: string
  status: string
  health_score: number
  fit_score: number
  last_activity_at: string | null
}

interface ScoreData {
  score_type: string
  score_value: number
  component_scores: Record<string, number>
  calculated_at: string
}

function getGrade(score: number): string {
  if (score >= 80) return 'M100'
  if (score >= 60) return 'M75'
  if (score >= 40) return 'M50'
  if (score >= 20) return 'M25'
  return 'M10'
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'green'
  if (score >= 60) return 'blue'
  if (score >= 40) return 'yellow'
  if (score >= 20) return 'red'
  return 'redBright'
}

export default function AccountDetail({ client, workspace, accountId, onNavigate }: AccountDetailProps) {
  const [account, setAccount] = useState<AccountData | null>(null)
  const [scores, setScores] = useState<ScoreData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [acctRes, scoresRes] = await Promise.allSettled([
        client.get<{ accounts: AccountData[] }>('/api/accounts', { id: accountId }),
        client.get<{ scores: ScoreData[] }>(`/api/heuristics/scores/${accountId}`),
      ])

      if (acctRes.status === 'fulfilled') {
        const accts = acctRes.value.accounts || []
        setAccount(accts[0] || null)
      }
      if (scoresRes.status === 'fulfilled') {
        setScores(scoresRes.value.scores || [])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [accountId])

  useInput((input, key) => {
    if (key.escape) onNavigate('accounts')
    if (input === 'r') fetchData()
    if (input === 'q') process.exit(0)
  })

  if (loading) {
    return (
      <Layout workspace={workspace} title="Account Detail">
        <Spinner label="Loading account..." />
      </Layout>
    )
  }

  if (error || !account) {
    return (
      <Layout workspace={workspace} title="Account Detail">
        <Text color="red">Error: {error || 'Account not found'}</Text>
        <Text dimColor>Press [Esc] to go back</Text>
      </Layout>
    )
  }

  const healthScore = scores.find((s) => s.score_type === 'health')
  const expansionScore = scores.find((s) => s.score_type === 'expansion')
  const churnScore = scores.find((s) => s.score_type === 'churn_risk')
  const grade = getGrade(account.health_score)

  return (
    <Layout
      workspace={workspace}
      title={`Account: ${account.name || account.domain || accountId}`}
      footer="[r]efresh  [Esc] back  [q]uit"
    >
      {/* Basic info */}
      <Box flexDirection="column">
        <Box>
          {account.domain && <><Text dimColor>Domain: </Text><Text>{account.domain}</Text><Text>   </Text></>}
          <Text dimColor>ARR: </Text><Text bold>{formatCurrency(account.arr)}</Text>
          <Text>   </Text>
          <Text dimColor>Plan: </Text><Text>{account.plan}</Text>
          <Text>   </Text>
          <Text dimColor>Status: </Text><Text color={account.status === 'active' ? 'green' : account.status === 'trial' ? 'yellow' : 'red'}>{account.status}</Text>
        </Box>
        {account.last_activity_at && (
          <Box>
            <Text dimColor>Last Activity: </Text><Text>{formatRelativeTime(account.last_activity_at)}</Text>
          </Box>
        )}
      </Box>

      {/* Score cards */}
      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text bold>SCORES</Text>
          <Text>   Grade: </Text>
          <Text bold color={getScoreColor(account.health_score)}>{grade}</Text>
        </Box>
        <Box>
          <MetricCard
            label="Health"
            value={String(Math.round(healthScore?.score_value ?? account.health_score))}
            color={getScoreColor(healthScore?.score_value ?? account.health_score)}
            width={16}
          />
          <MetricCard
            label="Expansion"
            value={String(Math.round(expansionScore?.score_value ?? 0))}
            color={getScoreColor(expansionScore?.score_value ?? 0)}
            width={16}
          />
          <MetricCard
            label="Churn Risk"
            value={String(Math.round(churnScore?.score_value ?? 0))}
            color={getScoreColor(100 - (churnScore?.score_value ?? 0))}
            width={16}
          />
        </Box>
      </Box>

      {/* Score bar visualizations */}
      <Box marginTop={1} flexDirection="column">
        <BarChart
          label="Health:    "
          value={Math.round(healthScore?.score_value ?? account.health_score)}
          maxValue={100}
          width={30}
          color={getScoreColor(healthScore?.score_value ?? account.health_score)}
        />
        <BarChart
          label="Expansion: "
          value={Math.round(expansionScore?.score_value ?? 0)}
          maxValue={100}
          width={30}
          color={getScoreColor(expansionScore?.score_value ?? 0)}
        />
        <BarChart
          label="Churn Risk:"
          value={Math.round(churnScore?.score_value ?? 0)}
          maxValue={100}
          width={30}
          color={getScoreColor(100 - (churnScore?.score_value ?? 0))}
        />
      </Box>

      {/* Component score breakdowns */}
      {scores.map((score) => {
        const components = Object.entries(score.component_scores || {})
        if (components.length === 0) return null
        return (
          <Box key={score.score_type} marginTop={1} flexDirection="column">
            <Text bold>{score.score_type.toUpperCase()} COMPONENTS</Text>
            {components.map(([name, value]) => (
              <Box key={name}>
                <Text dimColor>{name.padEnd(20)}</Text>
                <BarChart value={Math.round(value)} maxValue={100} width={20} color="cyan" />
              </Box>
            ))}
          </Box>
        )
      })}
    </Layout>
  )
}
