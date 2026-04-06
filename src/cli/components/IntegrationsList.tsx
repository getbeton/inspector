import React, { useState, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import Layout from './Layout.js'
import StatusBadge from './ui/StatusBadge.js'
import Spinner from './ui/Spinner.js'
import { type CLIApiClient } from '../lib/api-client.js'
import { formatRelativeTime } from '../utils/format.js'

interface IntegrationsListProps {
  client: CLIApiClient
  workspace: string
  onNavigate: (view: string, data?: unknown) => void
}

interface IntegrationItem {
  id: string
  name: string
  display_name: string
  description: string
  category: string
  is_connected: boolean
  last_validated_at: string | null
  supports_self_hosted: boolean
}

const CATEGORY_LABELS: Record<string, string> = {
  data_source: 'DATA SOURCES',
  crm: 'CRM',
  billing: 'BILLING',
  enrichment: 'ENRICHMENT',
  web_scraping: 'WEB SCRAPING',
}

const CATEGORY_ORDER = ['data_source', 'crm', 'billing', 'enrichment', 'web_scraping']

export default function IntegrationsList({ client, workspace, onNavigate }: IntegrationsListProps) {
  const [integrations, setIntegrations] = useState<IntegrationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ name: string; success: boolean; message?: string } | null>(null)

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await client.get<{ integrations: IntegrationItem[] }>('/api/integrations')
      setIntegrations(res.integrations || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const testIntegration = async (name: string) => {
    setTesting(name)
    setTestResult(null)
    try {
      const res = await client.get<{ connected: boolean; message?: string }>(
        `/api/integrations/${name}/credentials`
      )
      setTestResult({ name, success: res.connected !== false, message: 'Connection successful' })
    } catch (err) {
      setTestResult({ name, success: false, message: err instanceof Error ? err.message : 'Test failed' })
    } finally {
      setTesting(null)
    }
  }

  // Flatten for selection
  const flatList = integrations

  useInput((input, key) => {
    if (key.escape) { onNavigate('dashboard'); return }
    if (key.upArrow && selectedIndex > 0) setSelectedIndex(selectedIndex - 1)
    else if (key.downArrow && selectedIndex < flatList.length - 1) setSelectedIndex(selectedIndex + 1)
    else if (input === 't' && flatList[selectedIndex]?.is_connected) {
      testIntegration(flatList[selectedIndex].name)
    }
    else if (input === 'r') fetchData()
    else if (input === 'q') process.exit(0)
  })

  if (loading) {
    return (
      <Layout workspace={workspace} title="Integrations">
        <Spinner label="Loading integrations..." />
      </Layout>
    )
  }

  if (error) {
    return (
      <Layout workspace={workspace} title="Integrations">
        <Text color="red">Error: {error}</Text>
        <Text dimColor>Press [r] to retry, [Esc] to go back</Text>
      </Layout>
    )
  }

  // Group by category
  const grouped = new Map<string, IntegrationItem[]>()
  for (const cat of CATEGORY_ORDER) {
    const items = integrations.filter((i) => i.category === cat)
    if (items.length > 0) grouped.set(cat, items)
  }

  let globalIndex = 0

  return (
    <Layout
      workspace={workspace}
      title="Integrations"
      footer="[t]est connection  [r]efresh  [Esc] back  [q]uit"
    >
      {Array.from(grouped.entries()).map(([category, items]) => (
        <Box key={category} flexDirection="column" marginBottom={1}>
          <Text bold dimColor>{CATEGORY_LABELS[category] || category.toUpperCase()}</Text>
          {items.map((item) => {
            const idx = globalIndex++
            const isSelected = selectedIndex === idx
            return (
              <Box key={item.id} flexDirection="column" marginLeft={1}>
                <Box>
                  {isSelected && <Text color="cyan">{'\u25b6 '}</Text>}
                  {!isSelected && <Text>{'  '}</Text>}
                  <Text bold inverse={isSelected} color={isSelected ? 'cyan' : undefined}>
                    {(item.display_name || item.name).padEnd(18)}
                  </Text>
                  <StatusBadge
                    status={item.is_connected ? 'connected' : 'not connected'}
                  />
                  {item.last_validated_at && (
                    <Text dimColor>  Last sync: {formatRelativeTime(item.last_validated_at)}</Text>
                  )}
                </Box>
                {testing === item.name && (
                  <Box marginLeft={4}>
                    <Spinner label="Testing connection..." />
                  </Box>
                )}
                {testResult?.name === item.name && (
                  <Box marginLeft={4}>
                    <Text color={testResult.success ? 'green' : 'red'}>
                      {testResult.success ? '\u2714' : '\u2718'} {testResult.message}
                    </Text>
                  </Box>
                )}
              </Box>
            )
          })}
        </Box>
      ))}
    </Layout>
  )
}
