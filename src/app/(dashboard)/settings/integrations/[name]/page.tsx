'use client'

import { use, useCallback, useState } from 'react'
import { notFound, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
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
import { useSession } from '@/components/auth/session-provider'
import { GuestSignInPrompt } from '@/components/auth/GuestSignInPrompt'
import {
  useIntegrationCredentials,
  useDisconnectIntegration,
} from '@/lib/hooks/use-integrations'
import { integrationKeys } from '@/lib/hooks/use-integrations'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils/cn'
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  AlertCircle,
  Check,
  Link2,
} from 'lucide-react'

// Per-integration settings pages only exist for HubSpot today. Other
// integrations are managed inline on the main /settings page.
const MANAGED_INTEGRATIONS = new Set(['hubspot'])

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'field-mapping', label: 'Field mapping' },
] as const

type TabId = (typeof TABS)[number]['id']

export default function IntegrationSettingsPage({
  params,
}: {
  params: Promise<{ name: string }>
}) {
  const { name } = use(params)
  if (!MANAGED_INTEGRATIONS.has(name)) notFound()
  return <HubSpotSettings />
}

function HubSpotSettings() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { session, loading: sessionLoading } = useSession()
  const { data, isLoading } = useIntegrationCredentials('hubspot')
  const disconnectMutation = useDisconnectIntegration()

  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [showToken, setShowToken] = useState(false)
  const [editing, setEditing] = useState(false)
  const [newToken, setNewToken] = useState('')
  const [validating, setValidating] = useState(false)
  const [validateError, setValidateError] = useState<string | null>(null)

  const isConnected = !!(data?.credentials !== null && data?.isActive)
  const maskedToken = data?.credentials?.apiKey ?? null
  const hubId =
    (data?.configJson as Record<string, unknown> | null | undefined)?.hub_id != null
      ? String((data!.configJson as Record<string, unknown>).hub_id)
      : null

  const handleSaveToken = useCallback(async () => {
    if (!newToken.trim()) {
      setValidateError('Paste a HubSpot Private App token to continue.')
      return
    }
    setValidating(true)
    setValidateError(null)
    try {
      const res = await fetch('/api/integrations/hubspot/validate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: newToken }),
      })
      const result = await res.json().catch(() => ({}))
      if (!res.ok || result?.success === false) {
        const message =
          result?.error?.message ||
          (res.status === 429
            ? 'Too many attempts. Wait a minute and try again.'
            : 'Could not connect to HubSpot. Verify the token and its scopes.')
        throw new Error(message)
      }
      // Re-fetch the masked credential + hub id.
      await queryClient.invalidateQueries({ queryKey: integrationKeys.credentials('hubspot') })
      setEditing(false)
      setNewToken('')
      setShowToken(false)
      toastManager.add({ type: 'success', title: 'HubSpot token updated and re-validated' })
    } catch (err) {
      setValidateError(err instanceof Error ? err.message : 'Failed to validate token.')
    } finally {
      setValidating(false)
    }
  }, [newToken, queryClient])

  const handleDisconnect = useCallback(async () => {
    try {
      await disconnectMutation.mutateAsync('hubspot')
      toastManager.add({ type: 'success', title: 'HubSpot disconnected' })
      router.push('/settings')
    } catch {
      toastManager.add({ type: 'error', title: 'Failed to disconnect HubSpot' })
    }
  }, [disconnectMutation, router])

  if (sessionLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner className="size-6" />
      </div>
    )
  }
  if (!session) return <GuestSignInPrompt message="Sign in to manage HubSpot" />

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/settings"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        All integrations
      </Link>

      {/* Page head */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 items-center justify-center border-2 border-foreground bg-[#FF7A59]/10 font-heading text-lg font-bold"
            aria-hidden="true"
          >
            H
          </div>
          <div>
            <h2 className="text-2xl font-bold">HubSpot</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {isConnected ? (
                <Badge className="bg-success/10 text-success border-success/20">Connected</Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">Not connected</Badge>
              )}
              {isConnected && hubId && (
                <span>
                  Hub <span className="font-mono font-semibold text-foreground">{hubId}</span>
                </span>
              )}
            </div>
          </div>
        </div>
        {isConnected && (
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
                <DialogTitle>Disconnect HubSpot?</DialogTitle>
                <DialogDescription>
                  This removes the stored token and stops Beton from writing signals into HubSpot.
                  Field mappings are preserved if you reconnect.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button variant="outline">Cancel</Button>} />
                <DialogClose
                  render={
                    <Button variant="destructive" onClick={handleDisconnect}>
                      Disconnect
                    </Button>
                  }
                />
              </DialogFooter>
            </DialogPopup>
          </Dialog>
        )}
      </div>

      {!isConnected ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>HubSpot is not connected</AlertTitle>
          <AlertDescription>
            Connect HubSpot from the{' '}
            <Link href="/setup" className="text-primary hover:underline">
              setup wizard
            </Link>{' '}
            to manage its token and field mappings here.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {/* Tab bar */}
          <div
            role="tablist"
            aria-label="HubSpot settings tabs"
            className="flex gap-1 border-b border-border pb-px"
          >
            {TABS.map((tab) => {
              const active = tab.id === activeTab
              return (
                <button
                  key={tab.id}
                  id={`tab-${tab.id}`}
                  role="tab"
                  type="button"
                  aria-selected={active}
                  aria-controls={`tabpanel-${tab.id}`}
                  tabIndex={active ? 0 : -1}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* Overview tab */}
          <div
            id="tabpanel-overview"
            role="tabpanel"
            aria-labelledby="tab-overview"
            hidden={activeTab !== 'overview'}
          >
            {activeTab === 'overview' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Token</CardTitle>
                  <CardDescription>
                    Beton authenticates to HubSpot with a Private App token. Edit it to rotate the
                    credential — the new token is re-validated before it is saved.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!editing ? (
                    <>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 truncate rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm">
                          {maskedToken
                            ? showToken
                              ? maskedToken
                              : '••••••••••••••••••••••••'
                            : 'No token stored'}
                        </code>
                        <button
                          type="button"
                          onClick={() => setShowToken((s) => !s)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          aria-label={showToken ? 'Hide token' : 'Reveal token'}
                          disabled={!maskedToken}
                        >
                          {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        The full token is never returned to the browser — only a masked preview is
                        shown.
                      </p>
                      <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                        Edit token
                      </Button>
                    </>
                  ) : (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="hubspot-new-token">New HubSpot Private App token</Label>
                        <div className="relative">
                          <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            id="hubspot-new-token"
                            type={showToken ? 'text' : 'password'}
                            value={newToken}
                            onChange={(e) => {
                              setNewToken(e.target.value)
                              if (validateError) setValidateError(null)
                            }}
                            placeholder="pat-na1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                            disabled={validating}
                            className={cn('pl-9 pr-10 font-mono', validateError && 'border-destructive')}
                            aria-invalid={!!validateError}
                          />
                          <button
                            type="button"
                            onClick={() => setShowToken((s) => !s)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                            aria-label={showToken ? 'Hide token' : 'Show token'}
                            disabled={validating}
                          >
                            {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                      {validateError && (
                        <Alert variant="error">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>Validation failed</AlertTitle>
                          <AlertDescription>{validateError}</AlertDescription>
                        </Alert>
                      )}
                      <div className="flex items-center gap-2">
                        <Button onClick={handleSaveToken} disabled={validating || !newToken.trim()}>
                          {validating ? (
                            <>
                              <Spinner className="h-4 w-4" /> Validating…
                            </>
                          ) : (
                            <>
                              <Check className="h-4 w-4" /> Save + re-validate
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setEditing(false)
                            setNewToken('')
                            setValidateError(null)
                          }}
                          disabled={validating}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Field mapping tab — links out to the existing field-mapping route */}
          <div
            id="tabpanel-field-mapping"
            role="tabpanel"
            aria-labelledby="tab-field-mapping"
            hidden={activeTab !== 'field-mapping'}
          >
            {activeTab === 'field-mapping' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Field mapping</CardTitle>
                  <CardDescription>
                    Choose which HubSpot property on each object (contact, company, deal) receives
                    each Beton signal field.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    render={<Link href="/settings/integrations/hubspot/field-mapping" />}
                  >
                    Open field mapping
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  )
}
