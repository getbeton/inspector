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
import { toastManager } from '@/components/ui/toast'
import { cn } from '@/lib/utils/cn'

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
]

export default function SettingsIntegrationsPage() {
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
    toastManager.add({ type: 'success', title: 'Configuration saved' })
  }

  const handleDisconnect = async (integrationId: string) => {
    setIntegrations(integrations.map(integration => {
      if (integration.id !== integrationId) return integration
      return {
        ...integration,
        status: 'not_connected',
        fields: integration.fields.map(field => ({ ...field, value: '' })),
        lastSync: undefined,
      }
    }))
    toastManager.add({ type: 'success', title: 'Integration disconnected' })
  }

  const handleTestConnection = async (integrationId: string) => {
    // Simulate test
    await new Promise(resolve => setTimeout(resolve, 1500))
    toastManager.add({ type: 'success', title: `Connection test passed for ${integrationId}` })
  }

  return (
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
                                <DialogTitle>Disconnect {integration.name}?</DialogTitle>
                                <DialogDescription>
                                  This will remove the stored credentials and stop syncing data from {integration.name}.
                                </DialogDescription>
                              </DialogHeader>
                              <DialogFooter>
                                <DialogClose render={<Button variant="outline">Cancel</Button>} />
                                <DialogClose
                                  render={
                                    <Button
                                      variant="destructive"
                                      onClick={() => handleDisconnect(integration.id)}
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
        ))}
      </CardContent>
    </Card>
  )
}
