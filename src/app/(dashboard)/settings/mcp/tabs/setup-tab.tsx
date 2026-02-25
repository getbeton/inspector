'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { CopyButton } from '@/components/ui/copy-button'
import { useSession } from '@/components/auth/session-provider'
import { GuestSignInPrompt } from '@/components/auth/GuestSignInPrompt'
import { cn } from '@/lib/utils/cn'

// ---------------------------------------------------------------------------
// MCP URL derivation
// ---------------------------------------------------------------------------

function getMcpUrl(): string {
  // In production: derive from app URL (e.g., inspector.getbeton.ai → inspector.getbeton.ai/mcp)
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/mcp`
  }
  return 'https://inspector.getbeton.ai/mcp'
}

// ---------------------------------------------------------------------------
// Agent config templates
// ---------------------------------------------------------------------------

interface AgentConfig {
  id: string
  label: string
  filePath: string
  /** Primary config uses npx mcp-remote (OAuth, no API key needed) */
  buildConfig: (mcpUrl: string) => string
  /** Fallback config with static API key for agents that don't support mcp-remote */
  buildApiKeyConfig?: (mcpUrl: string, apiKey: string) => string
}

const AGENT_CONFIGS: AgentConfig[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    filePath: '~/.claude/mcp.json',
    buildConfig: (mcpUrl) =>
      JSON.stringify(
        {
          mcpServers: {
            beton: {
              command: 'npx',
              args: ['mcp-remote@latest', mcpUrl],
            },
          },
        },
        null,
        2,
      ),
    buildApiKeyConfig: (mcpUrl, apiKey) =>
      JSON.stringify(
        {
          mcpServers: {
            beton: {
              type: 'url',
              url: mcpUrl,
              headers: { Authorization: `Bearer ${apiKey}` },
            },
          },
        },
        null,
        2,
      ),
  },
  {
    id: 'cursor',
    label: 'Cursor',
    filePath: '~/.cursor/mcp.json',
    buildConfig: (mcpUrl) =>
      JSON.stringify(
        {
          mcpServers: {
            beton: {
              command: 'npx',
              args: ['mcp-remote@latest', mcpUrl],
            },
          },
        },
        null,
        2,
      ),
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    filePath: '~/.codeium/windsurf/mcp_config.json',
    buildConfig: (mcpUrl) =>
      JSON.stringify(
        {
          mcpServers: {
            beton: {
              command: 'npx',
              args: ['mcp-remote@latest', mcpUrl],
            },
          },
        },
        null,
        2,
      ),
  },
  {
    id: 'continue',
    label: 'VS Code (Continue)',
    filePath: '~/.continue/config.json',
    buildConfig: (mcpUrl) =>
      JSON.stringify(
        {
          mcpServers: [
            {
              name: 'beton',
              command: 'npx',
              args: ['mcp-remote@latest', mcpUrl],
            },
          ],
        },
        null,
        2,
      ),
  },
]

// ---------------------------------------------------------------------------
// Setup Tab
// ---------------------------------------------------------------------------

export default function SetupTab() {
  const { session, loading: sessionLoading } = useSession()

  if (sessionLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="size-5" />
      </div>
    )
  }

  if (!session) {
    return <GuestSignInPrompt message="Sign in to configure MCP" />
  }

  return (
    <div className="space-y-6">
      <AgentSnippetsCard />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Agent Snippets Card
// ---------------------------------------------------------------------------

function AgentSnippetsCard() {
  const [selectedAgent, setSelectedAgent] = useState(AGENT_CONFIGS[0].id)
  const mcpUrl = getMcpUrl()

  const agentConfig = AGENT_CONFIGS.find((c) => c.id === selectedAgent) ?? AGENT_CONFIGS[0]

  // Primary config: npx mcp-remote (uses OAuth, no API key needed)
  const configText = useMemo(() => {
    return agentConfig.buildConfig(mcpUrl)
  }, [agentConfig, mcpUrl])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Installation</CardTitle>
        <CardDescription>
          Copy the config snippet for your AI agent and paste it into the config file. On first use,
          a browser window will open for you to log in to Beton.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Agent selector */}
        <div className="flex flex-wrap gap-1">
          {AGENT_CONFIGS.map((agent) => (
            <button
              key={agent.id}
              type="button"
              onClick={() => setSelectedAgent(agent.id)}
              className={cn(
                'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                agent.id === selectedAgent
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {agent.label}
            </button>
          ))}
        </div>

        {/* Config file path */}
        <p className="text-xs text-muted-foreground font-mono">{agentConfig.filePath}</p>

        {/* Config code block */}
        <div className="relative rounded-md border-2 border-border bg-muted/50 p-3">
          <pre className="overflow-x-auto text-xs font-mono leading-relaxed">{configText}</pre>
          <div className="absolute top-2 right-2 flex items-center gap-1">
            <CopyButton value={configText} size="sm" />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Requires <code className="text-[0.8em] px-1 py-0.5 rounded bg-muted">npx</code> (Node.js 18+).
          Authentication is handled automatically via OAuth — no API key required.
        </p>
      </CardContent>
    </Card>
  )
}
