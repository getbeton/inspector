'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils/cn'
import { BillingStatusCard } from '@/components/billing'
import { useBillingStatus } from '@/lib/hooks/use-billing'

interface Integration {
  id: string
  name: string
  description: string
  icon: string
  status: 'connected' | 'not_connected' | 'error'
  fields: {
    id: string
    label: string
    type: 'text' | 'password'
    placeholder: string
    value: string
  }[]
  lastSync?: string
}

const INITIAL_INTEGRATIONS: Integration[] = [
  {
    id: 'posthog',
    name: 'PostHog',
    description: 'Product analytics and event tracking',
    icon: 'P',
    status: 'connected',
    fields: [
      { id: 'api_key', label: 'API Key', type: 'password', placeholder: 'phc_...', value: '••••••••••••••••' },
      { id: 'project_id', label: 'Project ID', type: 'text', placeholder: '12345', value: '47291' },
    ],
    lastSync: '2024-12-31T09:30:00Z',
  },
  {
    id: 'attio',
    name: 'Attio',
    description: 'CRM integration for syncing accounts and contacts',
    icon: 'A',
    status: 'not_connected',
    fields: [
      { id: 'api_key', label: 'API Key', type: 'password', placeholder: 'attio_...', value: '' },
      { id: 'workspace_id', label: 'Workspace ID', type: 'text', placeholder: 'ws_...', value: '' },
    ],
  },
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Payment and subscription data',
    icon: 'S',
    status: 'connected',
    fields: [
      { id: 'api_key', label: 'Secret Key', type: 'password', placeholder: 'sk_live_...', value: '••••••••••••••••' },
    ],
    lastSync: '2024-12-31T08:15:00Z',
  },
  {
    id: 'apollo',
    name: 'Apollo',
    description: 'Company enrichment and firmographic data',
    icon: 'A',
    status: 'error',
    fields: [
      { id: 'api_key', label: 'API Key', type: 'password', placeholder: 'apollo_...', value: '••••••••••••••••' },
    ],
    lastSync: '2024-12-30T14:00:00Z',
  },
]

export default function SettingsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>(INITIAL_INTEGRATIONS)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)

  const getStatusBadge = (status: Integration['status']) => {
    switch (status) {
      case 'connected':
        return <Badge className="bg-success/10 text-success border-success/20">Connected</Badge>
      case 'error':
        return <Badge className="bg-destructive/10 text-destructive border-destructive/20">Error</Badge>
      default:
        return <Badge variant="outline" className="text-muted-foreground">Not Connected</Badge>
    }
  }

  const formatLastSync = (dateString?: string) => {
    if (!dateString) return null
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))

    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return date.toLocaleDateString()
  }

  const handleEdit = (integration: Integration) => {
    setEditingId(integration.id)
    const values: Record<string, string> = {}
    integration.fields.forEach(field => {
      values[field.id] = field.value.startsWith('•') ? '' : field.value
    })
    setEditValues(values)
  }

  const handleSave = async (integrationId: string) => {
    setIsSaving(true)
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000))

    setIntegrations(integrations.map(integration => {
      if (integration.id !== integrationId) return integration

      const hasValues = Object.values(editValues).some(v => v.trim())
      return {
        ...integration,
        status: hasValues ? 'connected' : 'not_connected',
        fields: integration.fields.map(field => ({
          ...field,
          value: editValues[field.id] ? '••••••••••••••••' : '',
        })),
        lastSync: hasValues ? new Date().toISOString() : undefined,
      }
    }))

    setEditingId(null)
    setEditValues({})
    setIsSaving(false)
  }

  const handleDisconnect = async (integrationId: string) => {
    if (!confirm('Are you sure you want to disconnect this integration?')) return

    setIntegrations(integrations.map(integration => {
      if (integration.id !== integrationId) return integration
      return {
        ...integration,
        status: 'not_connected',
        fields: integration.fields.map(field => ({ ...field, value: '' })),
        lastSync: undefined,
      }
    }))
  }

  const handleTestConnection = async (integrationId: string) => {
    // Simulate test
    await new Promise(resolve => setTimeout(resolve, 1500))
    alert(`Connection test for ${integrationId}: Success!`)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Configure integrations and workspace preferences
        </p>
      </div>

      {/* Billing */}
      <BillingStatusCard />

      {/* Integrations */}
      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
          <CardDescription>
            Connect your data sources and destinations to enable signal detection and syncing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {integrations.map(integration => (
            <div
              key={integration.id}
              className={cn(
                'border border-border rounded-lg transition-all',
                expandedId === integration.id ? 'ring-1 ring-primary/50' : ''
              )}
            >
              {/* Integration Header */}
              <div
                className="flex items-center justify-between p-4 cursor-pointer"
                onClick={() => setExpandedId(expandedId === integration.id ? null : integration.id)}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-10 h-10 rounded-sm flex items-center justify-center font-semibold',
                    integration.status === 'connected' ? 'bg-success/10 text-success' :
                    integration.status === 'error' ? 'bg-destructive/10 text-destructive' :
                    'bg-muted text-muted-foreground'
                  )}>
                    {integration.icon}
                  </div>
                  <div>
                    <p className="font-medium">{integration.name}</p>
                    <p className="text-sm text-muted-foreground">{integration.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {integration.lastSync && (
                    <span className="text-xs text-muted-foreground">
                      Last sync: {formatLastSync(integration.lastSync)}
                    </span>
                  )}
                  {getStatusBadge(integration.status)}
                  <svg
                    className={cn(
                      'w-4 h-4 text-muted-foreground transition-transform',
                      expandedId === integration.id ? 'rotate-180' : ''
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
              {expandedId === integration.id && (
                <div className="px-4 pb-4 border-t border-border pt-4">
                  {editingId === integration.id ? (
                    <div className="space-y-4">
                      {integration.fields.map(field => (
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
                      <div className="flex items-center gap-2 pt-2">
                        <Button onClick={() => handleSave(integration.id)} disabled={isSaving}>
                          {isSaving ? 'Saving...' : 'Save'}
                        </Button>
                        <Button variant="outline" onClick={() => setEditingId(null)} disabled={isSaving}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {integration.fields.map(field => (
                        <div key={field.id} className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">{field.label}</span>
                          <span className="text-sm font-mono">
                            {field.value || <span className="text-muted-foreground italic">Not set</span>}
                          </span>
                        </div>
                      ))}
                      <div className="flex items-center gap-2 pt-2">
                        <Button variant="outline" size="sm" onClick={() => handleEdit(integration)}>
                          {integration.status === 'connected' ? 'Update' : 'Configure'}
                        </Button>
                        {integration.status === 'connected' && (
                          <>
                            <Button variant="outline" size="sm" onClick={() => handleTestConnection(integration.id)}>
                              Test Connection
                            </Button>
                            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDisconnect(integration.id)}>
                              Disconnect
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Workspace Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
          <CardDescription>
            Manage your workspace settings and team members
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Workspace Name</label>
              <Input defaultValue="My Workspace" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Workspace Slug</label>
              <Input defaultValue="my-workspace" disabled className="bg-muted" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Default Timezone</label>
            <select className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm">
              <option value="UTC">UTC</option>
              <option value="America/New_York">Eastern Time (ET)</option>
              <option value="America/Los_Angeles">Pacific Time (PT)</option>
              <option value="Europe/London">London (GMT)</option>
              <option value="Europe/Paris">Paris (CET)</option>
            </select>
          </div>
          <div className="pt-2">
            <Button>Save Changes</Button>
          </div>
        </CardContent>
      </Card>

      {/* API Keys */}
      <Card>
        <CardHeader>
          <CardTitle>API Keys</CardTitle>
          <CardDescription>
            Manage API keys for programmatic access to Beton Inspector
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div>
                <p className="font-medium text-sm">Production Key</p>
                <p className="text-xs text-muted-foreground font-mono">beton_prod_••••••••••••</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">Active</Badge>
                <Button variant="outline" size="sm">Regenerate</Button>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div>
                <p className="font-medium text-sm">Development Key</p>
                <p className="text-xs text-muted-foreground font-mono">beton_dev_••••••••••••</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">Active</Badge>
                <Button variant="outline" size="sm">Regenerate</Button>
              </div>
            </div>
          </div>
          <div className="mt-4">
            <Button variant="outline">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create New Key
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>
            Irreversible actions that affect your workspace
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Delete Workspace</p>
              <p className="text-sm text-muted-foreground">
                Permanently delete this workspace and all associated data
              </p>
            </div>
            <Button variant="destructive">Delete Workspace</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
