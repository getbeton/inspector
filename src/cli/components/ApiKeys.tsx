import React, { useState, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import Layout from './Layout.js'
import Table, { type TableColumn } from './ui/Table.js'
import Spinner from './ui/Spinner.js'
import { type CLIApiClient } from '../lib/api-client.js'
import { formatRelativeTime, formatDate } from '../utils/format.js'

interface ApiKeysProps {
  client: CLIApiClient
  workspace: string
  onNavigate: (view: string, data?: unknown) => void
}

interface ApiKeyRow {
  id: string
  name: string
  key_prefix: string
  created_at: string
  last_used_at: string | null
}

export default function ApiKeys({ client, workspace, onNavigate }: ApiKeysProps) {
  const [keys, setKeys] = useState<ApiKeyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [newKeyMessage, setNewKeyMessage] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const fetchKeys = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await client.get<{ keys: ApiKeyRow[] }>('/api/auth/keys')
      setKeys(res.keys || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchKeys() }, [])

  const createKey = async () => {
    try {
      const res = await client.post<{ key: string; id: string }>('/api/auth/keys', {
        name: `cli-key-${Date.now()}`,
      })
      setNewKeyMessage(`New API key created: ${res.key}\nSave this key - it will not be shown again.`)
      fetchKeys()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const revokeKey = async (id: string) => {
    try {
      await client.delete(`/api/auth/keys/${id}`)
      setConfirmDelete(false)
      fetchKeys()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  useInput((input, key) => {
    if (confirmDelete) {
      if (input === 'y' && keys[selectedIndex]) {
        revokeKey(keys[selectedIndex].id)
      } else {
        setConfirmDelete(false)
      }
      return
    }

    if (key.escape) { onNavigate('dashboard'); return }
    if (key.upArrow && selectedIndex > 0) setSelectedIndex(selectedIndex - 1)
    else if (key.downArrow && selectedIndex < keys.length - 1) setSelectedIndex(selectedIndex + 1)
    else if (input === 'c') createKey()
    else if (input === 'd' && keys[selectedIndex]) setConfirmDelete(true)
    else if (input === 'r') {
      setNewKeyMessage(null)
      fetchKeys()
    }
    else if (input === 'q') process.exit(0)
  })

  const columns: TableColumn<ApiKeyRow>[] = [
    { key: 'name', header: 'Name', width: 20 },
    { key: 'key_prefix', header: 'Key Prefix', width: 18, render: (r) => `${r.key_prefix}****` },
    { key: 'created_at', header: 'Created', width: 18, render: (r) => formatDate(r.created_at, 'iso') },
    { key: 'last_used_at', header: 'Last Used', width: 14, render: (r) => r.last_used_at ? formatRelativeTime(r.last_used_at) : 'Never' },
  ]

  if (loading) {
    return (
      <Layout workspace={workspace} title="API Keys">
        <Spinner label="Loading API keys..." />
      </Layout>
    )
  }

  if (error) {
    return (
      <Layout workspace={workspace} title="API Keys">
        <Text color="red">Error: {error}</Text>
        <Text dimColor>Press [r] to retry, [Esc] to go back</Text>
      </Layout>
    )
  }

  return (
    <Layout
      workspace={workspace}
      title="API Keys"
      footer="[c]reate new key  [d]elete key  [r]efresh  [Esc] back  [q]uit"
    >
      {newKeyMessage && (
        <Box marginBottom={1} flexDirection="column">
          <Text color="green" bold>{newKeyMessage}</Text>
        </Box>
      )}

      {confirmDelete && keys[selectedIndex] && (
        <Box marginBottom={1}>
          <Text color="yellow" bold>
            Revoke key &quot;{keys[selectedIndex].name}&quot;? Press [y] to confirm, any other key to cancel.
          </Text>
        </Box>
      )}

      <Table
        columns={columns}
        data={keys}
        selectedIndex={selectedIndex}
        emptyMessage="No API keys found. Press [c] to create one."
      />
    </Layout>
  )
}
