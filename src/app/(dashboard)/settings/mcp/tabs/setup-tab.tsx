'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { CopyButton } from '@/components/ui/copy-button'
import { toastManager } from '@/components/ui/toast'
import { useApiKeys, useCreateApiKey, useRevealApiKey, useDeleteApiKey } from '@/lib/hooks/use-api-keys'
import { useSession } from '@/components/auth/session-provider'
import { GuestSignInPrompt } from '@/components/auth/GuestSignInPrompt'
import { Eye, EyeOff, Trash2, Key, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import {
  Dialog,
  DialogTrigger,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'

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
      <ServerUrlCard />
      <ApiKeyCard />
      <AgentSnippetsCard />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Server URL Card
// ---------------------------------------------------------------------------

function ServerUrlCard() {
  const mcpUrl = getMcpUrl()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Server Endpoint</CardTitle>
        <CardDescription>
          The URL your AI agent connects to via the Model Context Protocol
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 rounded-md border-2 border-border bg-muted/50 px-3 py-2 font-mono text-sm">
          <code className="flex-1 truncate">{mcpUrl}</code>
          <CopyButton value={mcpUrl} size="sm" />
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// API Key Card
// ---------------------------------------------------------------------------

function ApiKeyCard() {
  const { data: keys, isLoading } = useApiKeys()
  const createMutation = useCreateApiKey()
  const revealMutation = useRevealApiKey()
  const deleteMutation = useDeleteApiKey()
  const [revealedKey, setRevealedKey] = useState<string | null>(null)
  const [showKey, setShowKey] = useState(false)
  // Store newly created key plaintext (returned on creation only)
  const [newKeyPlaintext, setNewKeyPlaintext] = useState<string | null>(null)

  const activeKey = keys?.[0] ?? null
  const displayKey = newKeyPlaintext ?? revealedKey

  const handleCreate = async () => {
    try {
      const result = await createMutation.mutateAsync('MCP Key')
      setNewKeyPlaintext(result.key)
      setShowKey(true)
      toastManager.add({ type: 'success', title: 'API key created' })
    } catch {
      toastManager.add({ type: 'error', title: 'Failed to create API key' })
    }
  }

  const handleReveal = async () => {
    if (!activeKey) return
    if (displayKey) {
      setShowKey(!showKey)
      return
    }
    if (!activeKey.has_encrypted_key) {
      toastManager.add({
        type: 'warning',
        title: 'This key was created before encrypted storage. Generate a new key to enable reveal.',
      })
      return
    }
    try {
      const plaintext = await revealMutation.mutateAsync(activeKey.id)
      setRevealedKey(plaintext)
      setShowKey(true)
    } catch {
      toastManager.add({ type: 'error', title: 'Failed to reveal key' })
    }
  }

  const handleDelete = async () => {
    if (!activeKey) return
    try {
      await deleteMutation.mutateAsync(activeKey.id)
      setRevealedKey(null)
      setNewKeyPlaintext(null)
      setShowKey(false)
      toastManager.add({ type: 'success', title: 'API key revoked' })
    } catch {
      toastManager.add({ type: 'error', title: 'Failed to revoke key' })
    }
  }

  const maskKey = (key: string) => {
    if (key.length <= 12) return '••••••••'
    return `${key.substring(0, 8)}••••${key.substring(key.length - 4)}`
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>API Key</CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-6">
          <Spinner className="size-5" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>API Key</CardTitle>
        <CardDescription>
          Authenticates your AI agent with the MCP server. Used in the config snippets below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {activeKey ? (
          <>
            <div className="flex items-center gap-2 rounded-md border-2 border-border bg-muted/50 px-3 py-2 font-mono text-sm">
              <code className="flex-1 truncate">
                {displayKey
                  ? showKey
                    ? displayKey
                    : maskKey(displayKey)
                  : maskKey(`beton_${'x'.repeat(32)}`)
                }
              </code>
              <div className="flex items-center gap-1">
                {displayKey && <CopyButton value={displayKey} size="sm" />}
                <button
                  type="button"
                  onClick={handleReveal}
                  disabled={revealMutation.isPending}
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  aria-label={showKey ? 'Hide key' : 'Reveal key'}
                >
                  {revealMutation.isPending ? (
                    <Spinner className="size-3.5" />
                  ) : showKey && displayKey ? (
                    <EyeOff className="size-3.5" />
                  ) : (
                    <Eye className="size-3.5" />
                  )}
                </button>
                <Dialog>
                  <DialogTrigger
                    render={
                      <button
                        type="button"
                        className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
                        aria-label="Revoke key"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    }
                  />
                  <DialogPopup>
                    <DialogHeader>
                      <DialogTitle>Revoke API Key?</DialogTitle>
                      <DialogDescription>
                        This will permanently delete this key. Any MCP connections using it will stop working.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <DialogClose render={<Button variant="outline">Cancel</Button>} />
                      <DialogClose
                        render={
                          <Button variant="destructive" onClick={handleDelete}>
                            Revoke
                          </Button>
                        }
                      />
                    </DialogFooter>
                  </DialogPopup>
                </Dialog>
              </div>
            </div>
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Key className="size-3.5 mt-0.5 shrink-0" />
              <span>
                Created {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(activeKey.created_at))}.
                Expires {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(activeKey.expires_at))}.
              </span>
            </div>
            {!activeKey.has_encrypted_key && (
              <div className="flex items-start gap-2 text-xs text-warning">
                <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
                <span>
                  This key was created before encrypted storage was available. Revoke it and generate a new one to enable the reveal feature.
                </span>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 py-4">
            <p className="text-sm text-muted-foreground">No API key yet. Generate one to connect your AI agent.</p>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Generating\u2026' : 'Generate API Key'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
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
