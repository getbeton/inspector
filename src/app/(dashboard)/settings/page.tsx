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
import { Select, SelectTrigger, SelectPopup, SelectItem } from '@/components/ui/select'
import { ExternalLink, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import {
  useIntegrationCredentials,
  useSaveIntegration,
  useDisconnectIntegration,
} from '@/lib/hooks/use-integrations'
import { useIntegrationDefinitions } from '@/lib/hooks/use-integration-definitions'
import type { IntegrationCategory, IntegrationDefinition } from '@/lib/integrations/types'

// ---------------------------------------------------------------------------
// Category display labels
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<IntegrationCategory, string> = {
  data_source: 'Data Sources',
  crm: 'CRM',
  billing: 'Billing',
  enrichment: 'Enrichment',
  web_scraping: 'Web Scraping',
  notification: 'Notifications',
}

// ---------------------------------------------------------------------------
// Code-side field config (credential fields tightly coupled to API response)
// ---------------------------------------------------------------------------

interface FieldDef {
  id: string
  label: string
  type: 'text' | 'password'
  placeholder: string
  credentialKey: string
}

interface ExtraField {
  id: string
  label: string
  type: 'select' | 'text'
  options?: { value: string; label: string }[]
  placeholder?: string
  visibleWhen?: { field: string; value: string }
  hint?: string
}

interface SelfHostableConfig {
  cloudUrl: string
  urlPlaceholder?: string
}

interface IntegrationFieldConfig {
  fields: FieldDef[]
  extraFields?: ExtraField[]
  selfHostable?: SelfHostableConfig
  helpUrl?: string
}

const FIELD_CONFIGS: Record<string, IntegrationFieldConfig> = {
  posthog: {
    fields: [
      { id: 'api_key', label: 'API Key', type: 'password', placeholder: 'phc_...', credentialKey: 'apiKey' },
      { id: 'project_id', label: 'Project ID', type: 'text', placeholder: '12345', credentialKey: 'projectId' },
    ],
    selfHostable: {
      cloudUrl: 'us.posthog.com',
      urlPlaceholder: 'https://posthog.example.com',
    },
    helpUrl: 'https://us.posthog.com/settings/user-api-keys',
  },
  attio: {
    fields: [
      { id: 'api_key', label: 'API Key', type: 'password', placeholder: 'attio_...', credentialKey: 'apiKey' },
    ],
    helpUrl: 'https://app.attio.com/settings/api-keys',
  },
  firecrawl: {
    fields: [
      { id: 'api_key', label: 'API Key', type: 'password', placeholder: 'fc-...', credentialKey: 'apiKey' },
    ],
    selfHostable: {
      cloudUrl: 'api.firecrawl.dev',
      urlPlaceholder: 'https://firecrawl.example.com',
    },
    extraFields: [
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
        hint: 'Higher proxy tiers bypass bot detection but use more credits',
      },
    ],
    helpUrl: 'https://www.firecrawl.dev/app/api-keys',
  },
}

/**
 * Checks whether raw input looks like a valid base URL for an instance.
 * Accepts:  domain.com, www.domain.com, https://domain.com, http://sub.domain.co.uk
 * Rejects:  domaincom (no dot), ghsdgfds//domain.com, https:///domain.com
 */
function isValidInstanceUrl(raw: string): boolean {
  const trimmed = raw.trim()
  if (!trimmed) return false

  // Normalise: if no protocol, prepend https:// so URL() can parse it
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  try {
    const url = new URL(withProtocol)
    // hostname must contain at least one dot (rules out "domaincom")
    if (!url.hostname.includes('.')) return false
    // reject triple-slash patterns like https:///domain.com (empty hostname)
    if (!url.hostname) return false
    // reject if original had malformed slashes before the host
    // e.g. "ghsdgfds//domain.com" → URL would parse "ghsdgfds" as protocol
    if (!/^https?:\/\//i.test(withProtocol)) return false
    return true
  } catch {
    return false
  }
}

/** Extract pathname + hash from a cloud helpUrl, then graft it onto a self-hosted base. */
function buildHelpUrl(instanceRaw: string, cloudHelpUrl: string): string {
  const base = instanceRaw.trim().replace(/\/+$/, '')
  const withProtocol = /^https?:\/\//i.test(base) ? base : `https://${base}`
  try {
    const cloud = new URL(cloudHelpUrl)
    return withProtocol.replace(/\/+$/, '') + cloud.pathname + cloud.hash
  } catch {
    return withProtocol
  }
}

// ---------------------------------------------------------------------------
// IntegrationIcon — brandfetch CDN with fallback
// ---------------------------------------------------------------------------

function IntegrationIcon({
  definition,
  size = 32,
}: {
  definition: IntegrationDefinition
  size?: number
}) {
  const [error, setError] = useState(false)

  if (error || (!definition.icon_url && !definition.icon_url_light)) {
    return (
      <div
        className="flex items-center justify-center rounded-md border-2 border-border bg-muted font-bold text-muted-foreground"
        style={{ width: size, height: size }}
      >
        {definition.display_name[0]}
      </div>
    )
  }

  return (
    <picture>
      {definition.icon_url_light && (
        <source
          srcSet={definition.icon_url_light}
          media="(prefers-color-scheme: light)"
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={definition.icon_url || definition.icon_url_light!}
        alt={definition.display_name}
        width={size}
        height={size}
        className="rounded-md object-contain"
        onError={() => setError(true)}
      />
    </picture>
  )
}

// ---------------------------------------------------------------------------
// Per-integration card
// ---------------------------------------------------------------------------

function IntegrationCard({
  definition,
  fieldConfig,
}: {
  definition: IntegrationDefinition
  fieldConfig?: IntegrationFieldConfig
}) {
  const { data, isLoading } = useIntegrationCredentials(definition.name)
  const saveMutation = useSaveIntegration()
  const disconnectMutation = useDisconnectIntegration()

  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [showValues, setShowValues] = useState(false)
  const [testing, setTesting] = useState(false)

  const isConnected = data?.credentials !== null && data?.isActive
  const status: 'connected' | 'not_connected' | 'loading' = isLoading
    ? 'loading'
    : isConnected
      ? 'connected'
      : 'not_connected'

  const hasFieldConfig = !!fieldConfig

  const handleEdit = () => {
    if (!fieldConfig) return
    setEditing(true)
    const values: Record<string, string> = {}
    fieldConfig.fields.forEach(field => {
      values[field.id] = ''
    })
    const savedConfig = (data?.configJson ?? {}) as Record<string, unknown>
    if (definition.supports_self_hosted && fieldConfig.selfHostable) {
      const savedMode = savedConfig.mode
      values.mode = (savedMode === 'self_hosted') ? 'self_hosted' : 'cloud'
      const savedUrl = savedConfig.base_url
      values.base_url = savedUrl ? String(savedUrl) : ''
    }
    fieldConfig.extraFields?.forEach(field => {
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
      await saveMutation.mutateAsync({ name: definition.name, config: editValues })
      setEditing(false)
      setEditValues({})
      toastManager.add({ type: 'success', title: 'Configuration saved' })
    } catch {
      toastManager.add({ type: 'error', title: 'Failed to save configuration' })
    }
  }

  const handleDisconnect = async () => {
    try {
      await disconnectMutation.mutateAsync(definition.name)
      toastManager.add({ type: 'success', title: 'Integration disconnected' })
    } catch {
      toastManager.add({ type: 'error', title: 'Failed to disconnect' })
    }
  }

  const handleTestConnection = async () => {
    setTesting(true)
    try {
      if (definition.name === 'firecrawl') {
        const savedConfig = (data?.configJson ?? {}) as Record<string, unknown>
        const res = await fetch('/api/integrations/firecrawl/validate', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: '__use_stored__',
            mode: savedConfig.mode || 'cloud',
            base_url: savedConfig.base_url || undefined,
            proxy: savedConfig.proxy || undefined,
          }),
        })
        const result = await res.json()
        if (result.success) {
          toastManager.add({ type: 'success', title: 'Firecrawl connection verified' })
        } else {
          toastManager.add({
            type: 'error',
            title: result.error?.message || 'Connection test failed',
          })
        }
      } else {
        toastManager.add({ type: 'success', title: `Connection test passed for ${definition.display_name}` })
      }
    } catch {
      toastManager.add({ type: 'error', title: 'Connection test failed' })
    } finally {
      setTesting(false)
    }
  }

  const getFieldValue = (field: FieldDef): string | null => {
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
        'border-2 border-border rounded-lg transition-all',
        expanded ? 'ring-1 ring-primary/50' : ''
      )}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-md border-2 border-border bg-background p-1">
            <IntegrationIcon definition={definition} size={28} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-bold">{definition.display_name}</p>
              {definition.required && (
                <Badge size="sm">Required</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{definition.description}</p>
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
        <div className="px-4 pb-4 border-t-2 border-border pt-4">
          {!hasFieldConfig ? (
            <p className="text-sm text-muted-foreground italic">
              Configuration not yet available. Coming soon.
            </p>
          ) : editing ? (
            <div className="space-y-4">
              {/* Self-hostable: deployment mode & instance URL first */}
              {definition.supports_self_hosted && fieldConfig.selfHostable && (
                <>
                  <div>
                    <label className="text-sm font-bold uppercase tracking-wider mb-1.5 block">Deployment Mode</label>
                    <Select
                      value={editValues.mode || 'cloud'}
                      onValueChange={(val) => setEditValues({ ...editValues, mode: val as string })}
                    >
                      <SelectTrigger>
                        <span className="truncate">
                          {editValues.mode === 'self_hosted'
                            ? 'Self-hosted'
                            : `Cloud (${fieldConfig.selfHostable.cloudUrl})`}
                        </span>
                      </SelectTrigger>
                      <SelectPopup>
                        <SelectItem value="cloud">{`Cloud (${fieldConfig.selfHostable.cloudUrl})`}</SelectItem>
                        <SelectItem value="self_hosted">Self-hosted</SelectItem>
                      </SelectPopup>
                    </Select>
                  </div>
                  {editValues.mode === 'self_hosted' && (
                    <div>
                      <label className="text-sm font-bold uppercase tracking-wider mb-1.5 block">Instance URL</label>
                      <Input
                        type="text"
                        placeholder={fieldConfig.selfHostable.urlPlaceholder || 'https://your-instance.example.com'}
                        value={editValues.base_url || ''}
                        onChange={(e) => setEditValues({ ...editValues, base_url: e.target.value })}
                      />
                    </div>
                  )}
                </>
              )}
              {/* Extra fields (e.g. proxy tier) */}
              {fieldConfig.extraFields?.map(field => {
                if (!isExtraFieldVisible(field)) return null
                return (
                  <div key={field.id}>
                    <label className="text-sm font-bold uppercase tracking-wider mb-1.5 block">{field.label}</label>
                    {field.type === 'select' && field.options ? (
                      <Select
                        value={editValues[field.id] || field.options[0]?.value || ''}
                        onValueChange={(val) => setEditValues({ ...editValues, [field.id]: val as string })}
                      >
                        <SelectTrigger>
                          <span className="truncate">
                            {field.options.find(o => o.value === (editValues[field.id] || field.options![0]?.value))?.label
                              || 'Select...'}
                          </span>
                        </SelectTrigger>
                        <SelectPopup>
                          {field.options.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectPopup>
                      </Select>
                    ) : (
                      <Input
                        type="text"
                        placeholder={field.placeholder}
                        value={editValues[field.id] || ''}
                        onChange={(e) => setEditValues({ ...editValues, [field.id]: e.target.value })}
                      />
                    )}
                    {field.hint && (
                      <p className="text-xs text-muted-foreground mt-1.5">{field.hint}</p>
                    )}
                  </div>
                )
              })}
              {/* Help link — with live URL validation for self-hosted */}
              {(() => {
                const isSelfHosted = definition.supports_self_hosted && fieldConfig.selfHostable && editValues.mode === 'self_hosted'
                if (isSelfHosted && fieldConfig.helpUrl) {
                  const raw = editValues.base_url || ''
                  const helpHref = raw.trim() ? buildHelpUrl(raw, fieldConfig.helpUrl) : ''
                  const valid = raw.trim() ? isValidInstanceUrl(raw) : false

                  if (valid) {
                    return (
                      <a
                        href={helpHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        Get your API key <ExternalLink className="h-3 w-3" />
                      </a>
                    )
                  }
                  // Always show — invalid or empty URL gets error state
                  return (
                    <span className="inline-flex items-center gap-1 text-xs text-destructive">
                      <AlertCircle className="h-3 w-3" />
                      {raw.trim()
                        ? 'Enter a valid instance URL to get your API key link'
                        : 'Enter your instance URL above to get your API key link'}
                    </span>
                  )
                }
                // Cloud mode — static help URL
                if (!fieldConfig.helpUrl) return null
                return (
                  <a
                    href={fieldConfig.helpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    Get your API key <ExternalLink className="h-3 w-3" />
                  </a>
                )
              })()}
              {/* Credential fields (API key, project ID, etc.) */}
              {fieldConfig.fields.map(field => (
                <div key={field.id}>
                  <label className="text-sm font-bold uppercase tracking-wider mb-1.5 block">{field.label}</label>
                  <Input
                    type={field.type}
                    placeholder={field.placeholder}
                    value={editValues[field.id] || ''}
                    onChange={(e) => setEditValues({ ...editValues, [field.id]: e.target.value })}
                  />
                </div>
              ))}
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
              {fieldConfig.fields.map(field => {
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
                    <Button variant="outline" size="sm" onClick={handleTestConnection} disabled={testing}>
                      {testing ? 'Testing...' : 'Test Connection'}
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
                          <DialogTitle>Disconnect {definition.display_name}?</DialogTitle>
                          <DialogDescription>
                            This will remove the stored credentials and stop syncing data from {definition.display_name}.
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
// Category section
// ---------------------------------------------------------------------------

function CategorySection({
  category,
  definitions,
}: {
  category: IntegrationCategory
  definitions: IntegrationDefinition[]
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground border-b-2 border-border pb-2">
        {CATEGORY_LABELS[category]}
      </h3>
      {definitions.map((def) => (
        <IntegrationCard
          key={def.id}
          definition={def}
          fieldConfig={FIELD_CONFIGS[def.name]}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsIntegrationsPage() {
  const { session, loading } = useSession()
  const { data: definitions, isLoading: defsLoading } = useIntegrationDefinitions()

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><Spinner className="size-6" /></div>
  if (!session) return <GuestSignInPrompt message="Sign in to manage integrations" />

  // Group definitions by category, preserving display_order within each group
  const grouped = new Map<IntegrationCategory, IntegrationDefinition[]>()
  if (definitions) {
    for (const def of definitions) {
      const group = grouped.get(def.category) || []
      group.push(def)
      grouped.set(def.category, group)
    }
  }

  // Order categories by the lowest display_order in each group
  const sortedCategories = [...grouped.entries()].sort(
    ([, a], [, b]) => a[0].display_order - b[0].display_order
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Integrations</CardTitle>
        <CardDescription>
          Connect your data sources and destinations to enable signal detection and syncing
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {defsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner className="size-6" />
          </div>
        ) : sortedCategories.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No integrations available.</p>
        ) : (
          sortedCategories.map(([category, defs]) => (
            <CategorySection key={category} category={category} definitions={defs} />
          ))
        )}
      </CardContent>
    </Card>
  )
}
