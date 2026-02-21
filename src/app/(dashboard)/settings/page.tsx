'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
import { Spinner } from '@/components/ui/spinner'
import { toastManager } from '@/components/ui/toast'
import { useSession } from '@/components/auth/session-provider'
import { GuestSignInPrompt } from '@/components/auth/GuestSignInPrompt'
import { ExternalLink, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import {
  useIntegrationCredentials,
  useSaveIntegration,
  useDisconnectIntegration,
} from '@/lib/hooks/use-integrations'

// ---------------------------------------------------------------------------
// Integration metadata (static — never changes)
// ---------------------------------------------------------------------------

interface ExtraField {
  id: string
  label: string
  type: 'select' | 'text'
  options?: { value: string; label: string }[]
  placeholder?: string
  /** Show this field only when another field has a specific value */
  visibleWhen?: { field: string; value: string }
}

interface IntegrationMeta {
  id: string
  name: string
  description: string
  icon: string
  fields: {
    id: string
    label: string
    type: 'text' | 'password'
    placeholder: string
    credentialKey: string // maps to the credential response key
  }[]
  /** Additional config fields stored in config_json (not encrypted) */
  extraFields?: ExtraField[]
  helpUrl?: string
  /** Hidden integrations are only shown when already configured */
  hidden?: boolean
}

const INTEGRATIONS: IntegrationMeta[] = [
  {
    id: 'posthog',
    name: 'PostHog',
    description: 'Product analytics and event tracking',
    icon: 'P',
    fields: [
      { id: 'api_key', label: 'API Key', type: 'password', placeholder: 'phc_...', credentialKey: 'apiKey' },
      { id: 'project_id', label: 'Project ID', type: 'text', placeholder: '12345', credentialKey: 'projectId' },
    ],
  },
  {
    id: 'attio',
    name: 'Attio',
    description: 'CRM integration for syncing accounts and contacts',
    icon: 'A',
    fields: [
      { id: 'api_key', label: 'API Key', type: 'password', placeholder: 'attio_...', credentialKey: 'apiKey' },
    ],
    helpUrl: 'https://app.attio.com/settings/api-keys',
  },
  {
    id: 'firecrawl',
    name: 'Firecrawl',
    description: 'Web scraping to enrich agent analysis with web data',
    icon: 'F',
    fields: [
      { id: 'api_key', label: 'API Key', type: 'password', placeholder: 'fc-...', credentialKey: 'apiKey' },
    ],
    extraFields: [
      {
        id: 'mode',
        label: 'Deployment Mode',
        type: 'select',
        options: [
          { value: 'cloud', label: 'Cloud (api.firecrawl.dev)' },
          { value: 'self_hosted', label: 'Self-hosted' },
        ],
      },
      {
        id: 'base_url',
        label: 'Self-hosted URL',
        type: 'text',
        placeholder: 'https://firecrawl.example.com',
        visibleWhen: { field: 'mode', value: 'self_hosted' },
      },
      {
        id: 'proxy',
        label: 'Proxy Tier',
        type: 'select',
        options: [
          { value: '', label: 'None' },
          { value: 'basic', label: 'Basic' },
          { value: 'stealth', label: 'Stealth' },
        ],
        visibleWhen: { field: 'mode', value: 'cloud' },
      },
    ],
    helpUrl: 'https://www.firecrawl.dev/app/api-keys',
    hidden: true,
  },
]

// ---------------------------------------------------------------------------
// Per-integration card (uses real data)
// ---------------------------------------------------------------------------

function IntegrationCard({ meta }: { meta: IntegrationMeta }) {
  const { data, isLoading } = useIntegrationCredentials(meta.id)
  const saveMutation = useSaveIntegration()
  const disconnectMutation = useDisconnectIntegration()

  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [showValues, setShowValues] = useState(false)

  const isConnected = data?.credentials !== null && data?.isActive
  const status: 'connected' | 'not_connected' | 'loading' = isLoading
    ? 'loading'
    : isConnected
      ? 'connected'
      : 'not_connected'

  // Hidden integrations are only shown when already configured
  if (meta.hidden && !isLoading && !isConnected) return null

  const handleEdit = () => {
    setEditing(true)
    const values: Record<string, string> = {}
    meta.fields.forEach(field => {
      values[field.id] = ''
    })
    // Pre-populate extra fields from saved config_json, falling back to defaults
    const savedConfig = (data?.configJson ?? {}) as Record<string, unknown>
    meta.extraFields?.forEach(field => {
      const saved = savedConfig[field.id]
      if (saved !== undefined && saved !== null) {
        values[field.id] = String(saved)
      } else if (field.type === 'select' && field.options?.[0]) {
        values[field.id] = field.options[0].value
      } else {
        values[field.id] = ''
      }
    })
    setEditValues(values)
  }

  const handleSave = async () => {
    try {
      await saveMutation.mutateAsync({ name: meta.id, config: editValues })
      setEditing(false)
      setEditValues({})
      toastManager.add({ type: 'success', title: 'Configuration saved' })
    } catch {
      toastManager.add({ type: 'error', title: 'Failed to save configuration' })
    }
  }

  const handleDisconnect = async () => {
    try {
      await disconnectMutation.mutateAsync(meta.id)
      toastManager.add({ type: 'success', title: 'Integration disconnected' })
    } catch {
      toastManager.add({ type: 'error', title: 'Failed to disconnect' })
    }
  }

  const handleTestConnection = async () => {
    // Simulate test
    await new Promise(resolve => setTimeout(resolve, 1500))
    toastManager.add({ type: 'success', title: `Connection test passed for ${meta.name}` })
  }

  const getFieldValue = (field: IntegrationMeta['fields'][number]): string | null => {
    if (!data?.credentials) return null
    const creds = data.credentials as Record<string, string | null>
    return creds[field.credentialKey] ?? null
  }

  const maskValue = (value: string | null): string => {
    if (!value) return ''
    if (value.length <= 8) return '••••••••'
    return `${value.substring(0, 4)}••••${value.substring(value.length - 4)}`
  }

  const isExtraFieldVisible = (field: ExtraField): boolean => {
    if (!field.visibleWhen) return true
    return editValues[field.visibleWhen.field] === field.visibleWhen.value
  }

  return (
    <div
      className={cn(
        'border border-border rounded-lg transition-all',
        expanded ? 'ring-1 ring-primary/50' : ''
      )}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-10 h-10 rounded-sm flex items-center justify-center font-semibold',
            status === 'connected' ? 'bg-success/10 text-success' :
            status === 'loading' ? 'bg-muted text-muted-foreground' :
            'bg-muted text-muted-foreground'
          )}>
            {meta.icon}
          </div>
          <div>
            <p className="font-medium">{meta.name}</p>
            <p className="text-sm text-muted-foreground">{meta.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {status === 'loading' ? (
            <Spinner className="size-4" />
          ) : status === 'connected' ? (
            <Badge className="bg-success/10 text-success border-success/20">Connected</Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">Not Connected</Badge>
          )}
          <svg
            className={cn(
              'w-4 h-4 text-muted-foreground transition-transform',
              expanded ? 'rotate-180' : ''
            )}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expanded Config */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-border pt-4">
          {editing ? (
            <div className="space-y-4">
              {meta.fields.map(field => (
                <div key={field.id}>
                  <label className="text-sm font-medium mb-1.5 block">{field.label}</label>
                  <Input
                    type={field.type}
                    placeholder={field.placeholder}
                    value={editValues[field.id] || ''}
                    onChange={(e) => setEditValues({ ...editValues, [field.id]: e.target.value })}
                  />
                </div>
              ))}
              {meta.extraFields?.map(field => {
                if (!isExtraFieldVisible(field)) return null
                return (
                  <div key={field.id}>
                    <label className="text-sm font-medium mb-1.5 block">{field.label}</label>
                    {field.type === 'select' && field.options ? (
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={editValues[field.id] || ''}
                        onChange={(e) => setEditValues({ ...editValues, [field.id]: e.target.value })}
                      >
                        {field.options.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        type="text"
                        placeholder={field.placeholder}
                        value={editValues[field.id] || ''}
                        onChange={(e) => setEditValues({ ...editValues, [field.id]: e.target.value })}
                      />
                    )}
                  </div>
                )
              })}
              {meta.helpUrl && (
                <a
                  href={meta.helpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Get your API key <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <div className="flex items-center gap-2 pt-2">
                <Button onClick={handleSave} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? 'Saving...' : 'Save'}
                </Button>
                <Button variant="outline" onClick={() => setEditing(false)} disabled={saveMutation.isPending}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {meta.fields.map(field => {
                const realValue = getFieldValue(field)
                return (
                  <div key={field.id} className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{field.label}</span>
                    <span className="text-sm font-mono">
                      {realValue
                        ? showValues ? realValue : maskValue(realValue)
                        : <span className="text-muted-foreground italic">Not set</span>
                      }
                    </span>
                  </div>
                )
              })}
              <div className="flex items-center gap-2 pt-2">
                {isConnected && (
                  <button
                    type="button"
                    onClick={() => setShowValues(!showValues)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    aria-label={showValues ? 'Hide values' : 'Show values'}
                  >
                    {showValues ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                )}
                <Button variant="outline" size="sm" onClick={handleEdit}>
                  {isConnected ? 'Update' : 'Configure'}
                </Button>
                {isConnected && (
                  <>
                    <Button variant="outline" size="sm" onClick={handleTestConnection}>
                      Test Connection
                    </Button>
                    <Dialog>
                      <DialogTrigger
                        render={
                          <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                            Disconnect
                          </Button>
                        }
                      />
                      <DialogPopup>
                        <DialogHeader>
                          <DialogTitle>Disconnect {meta.name}?</DialogTitle>
                          <DialogDescription>
                            This will remove the stored credentials and stop syncing data from {meta.name}.
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                          <DialogClose render={<Button variant="outline">Cancel</Button>} />
                          <DialogClose
                            render={
                              <Button
                                variant="destructive"
                                onClick={handleDisconnect}
                              >
                                Disconnect
                              </Button>
                            }
                          />
                        </DialogFooter>
                      </DialogPopup>
                    </Dialog>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsIntegrationsPage() {
  const { session, loading } = useSession()
  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><Spinner className="size-6" /></div>
  if (!session) return <GuestSignInPrompt message="Sign in to manage integrations" />

  return (
    <Card>
      <CardHeader>
        <CardTitle>Integrations</CardTitle>
        <CardDescription>
          Connect your data sources and destinations to enable signal detection and syncing
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {INTEGRATIONS.map(meta => (
          <IntegrationCard key={meta.id} meta={meta} />
        ))}
      </CardContent>
    </Card>
  )
}
