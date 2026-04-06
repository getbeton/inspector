import React, { useState } from 'react'
import { useApp } from 'ink'
import Dashboard from './Dashboard.js'
import SignalsList from './SignalsList.js'
import SignalDetail from './SignalDetail.js'
import AccountsList from './AccountsList.js'
import AccountDetail from './AccountDetail.js'
import IdentitiesList from './IdentitiesList.js'
import IntegrationsList from './IntegrationsList.js'
import McpSessions from './McpSessions.js'
import ApiKeys from './ApiKeys.js'
import { type CLIApiClient } from '../lib/api-client.js'

interface AppProps {
  client: CLIApiClient
  workspace: string
  initialView?: string
}

type ViewState =
  | { name: 'dashboard' }
  | { name: 'signals' }
  | { name: 'signal-detail'; data: { id: string } }
  | { name: 'accounts' }
  | { name: 'account-detail'; data: { id: string } }
  | { name: 'identities' }
  | { name: 'integrations' }
  | { name: 'mcp'; data?: { sessionId?: string } }
  | { name: 'keys' }

export default function App({ client, workspace, initialView }: AppProps) {
  const { exit } = useApp()
  const [viewState, setViewState] = useState<ViewState>(
    initialView ? { name: initialView } as ViewState : { name: 'dashboard' }
  )

  const handleNavigate = (view: string, data?: unknown) => {
    if (view === 'quit') {
      exit()
      return
    }

    switch (view) {
      case 'dashboard':
        setViewState({ name: 'dashboard' })
        break
      case 'signals':
        setViewState({ name: 'signals' })
        break
      case 'signal-detail':
        setViewState({ name: 'signal-detail', data: data as { id: string } })
        break
      case 'accounts':
        setViewState({ name: 'accounts' })
        break
      case 'account-detail':
        setViewState({ name: 'account-detail', data: data as { id: string } })
        break
      case 'identities':
        setViewState({ name: 'identities' })
        break
      case 'integrations':
        setViewState({ name: 'integrations' })
        break
      case 'mcp':
        setViewState({ name: 'mcp', data: data as { sessionId?: string } | undefined })
        break
      case 'keys':
        setViewState({ name: 'keys' })
        break
      default:
        setViewState({ name: 'dashboard' })
    }
  }

  switch (viewState.name) {
    case 'dashboard':
      return <Dashboard client={client} workspace={workspace} onNavigate={handleNavigate} />
    case 'signals':
      return <SignalsList client={client} workspace={workspace} onNavigate={handleNavigate} />
    case 'signal-detail':
      return (
        <SignalDetail
          client={client}
          workspace={workspace}
          signalId={viewState.data.id}
          onNavigate={handleNavigate}
        />
      )
    case 'accounts':
      return <AccountsList client={client} workspace={workspace} onNavigate={handleNavigate} />
    case 'account-detail':
      return (
        <AccountDetail
          client={client}
          workspace={workspace}
          accountId={viewState.data.id}
          onNavigate={handleNavigate}
        />
      )
    case 'identities':
      return <IdentitiesList client={client} workspace={workspace} onNavigate={handleNavigate} />
    case 'integrations':
      return <IntegrationsList client={client} workspace={workspace} onNavigate={handleNavigate} />
    case 'mcp':
      return (
        <McpSessions
          client={client}
          workspace={workspace}
          onNavigate={handleNavigate}
          sessionId={viewState.data?.sessionId}
        />
      )
    case 'keys':
      return <ApiKeys client={client} workspace={workspace} onNavigate={handleNavigate} />
    default:
      return <Dashboard client={client} workspace={workspace} onNavigate={handleNavigate} />
  }
}
