'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { EventPicker } from '@/components/signals/event-picker'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { useSetupStatus } from '@/lib/hooks/use-setup-status'
import { useSession } from '@/components/auth/session-provider'
import { GuestSignInPrompt } from '@/components/auth/GuestSignInPrompt'
import { Check, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import {
  buildHubSpotTarget,
  type HubSpotObjectChoice,
} from '@/lib/signals/destination-target'

const CONDITION_OPERATORS = [
  { id: 'gte', label: '>=' },
  { id: 'gt', label: '>' },
  { id: 'eq', label: '=' },
  { id: 'lt', label: '<' },
  { id: 'lte', label: '<=' },
]

interface PreviewUser {
  distinct_id: string
  event_count: number
  profile_url: string
}

interface PreviewResult {
  users: PreviewUser[]
  total_matching_users: number
  aggregate: {
    total_count: number
    count_7d: number
    count_30d: number
  }
}

interface CohortResult {
  cohort_id: number
  cohort_name: string
  cohort_url: string
}

interface AttioListResult {
  list_id: string
  list_name: string
  entries_added: number
  entries_failed: number
}

export default function AddSignalPage() {
  const router = useRouter()
  const { session, loading: sessionLoading } = useSession()
  const { data: setupStatus } = useSetupStatus()
  const attioConnected = setupStatus?.integrations?.attio ?? false
  const hubspotConnected = setupStatus?.integrations?.hubspot ?? false

  // Form state — all hooks must be called before any early return
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [eventPatterns, setEventPatterns] = useState<string[]>([])
  const [conditionOperator, setConditionOperator] = useState('gte')
  const [conditionValue, setConditionValue] = useState('1')
  const [timeWindow, setTimeWindow] = useState('7')

  // Preview state
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [lastPreviewParams, setLastPreviewParams] = useState<string | null>(null)

  // Action state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isCreatingCohort, setIsCreatingCohort] = useState(false)
  const [cohortResult, setCohortResult] = useState<CohortResult | null>(null)
  const [isCreatingAttioList, setIsCreatingAttioList] = useState(false)
  const [attioListResult, setAttioListResult] = useState<AttioListResult | null>(null)
  const [cohortError, setCohortError] = useState<string | null>(null)
  const [attioListError, setAttioListError] = useState<string | null>(null)
  const [autoUpdateCohort, setAutoUpdateCohort] = useState(false)
  const [autoUpdateAttioList, setAutoUpdateAttioList] = useState(false)

  // Destination picker — which sub-config is shown. PostHog and Attio keep their
  // existing imperative create-then-auto-update flows; HubSpot routes by object type.
  const [destination, setDestination] = useState<'posthog_cohort' | 'attio_list' | 'hubspot'>('posthog_cohort')
  const [hubspotObject, setHubspotObject] = useState<HubSpotObjectChoice>('contact')

  if (!sessionLoading && !session) return <GuestSignInPrompt message="Sign in to create custom signals" />

  // Stale detection
  const currentParams = JSON.stringify({
    eventPatterns, conditionOperator, conditionValue, timeWindow,
  })
  const isStale = preview !== null && lastPreviewParams !== currentParams

  const formatNumber = (n: number) => new Intl.NumberFormat().format(n)

  const conditionSummary = () => {
    if (eventPatterns.length === 0) return ''
    const opLabel = CONDITION_OPERATORS.find(o => o.id === conditionOperator)?.label || '>='
    const events = eventPatterns.length === 1
      ? eventPatterns[0]
      : `[${eventPatterns.join(', ')}]`
    return `Users who triggered ${events} ${opLabel} ${conditionValue} times in the last ${timeWindow} days`
  }

  const handlePreview = async () => {
    if (eventPatterns.length === 0) return
    setIsPreviewing(true)
    setPreviewError(null)
    setPreview(null)

    try {
      const res = await fetch('/api/posthog/signal-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_names: eventPatterns,
          condition_operator: conditionOperator,
          condition_value: Number(conditionValue),
          time_window_days: Number(timeWindow),
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || `Failed to fetch preview (${res.status})`)
      }

      const data: PreviewResult = await res.json()
      setPreview(data)
      setLastPreviewParams(currentParams)
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Could not fetch preview')
    } finally {
      setIsPreviewing(false)
    }
  }

  const handleCreateCohort = async () => {
    if (!preview || preview.users.length === 0) {
      setCohortError('Run a preview first to find matching users')
      return
    }
    setCohortError(null)
    setIsCreatingCohort(true)

    try {
      const distinctIds = preview.users.map(u => u.distinct_id)
      const cohortName = `Signal: ${name || eventPatterns.join(', ')}`

      const res = await fetch('/api/posthog/cohorts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cohortName,
          distinct_ids: distinctIds,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Failed to create cohort')
      }

      const data: CohortResult = await res.json()
      setCohortResult(data)
    } catch (err) {
      setCohortError(err instanceof Error ? err.message : 'Failed to create cohort')
    } finally {
      setIsCreatingCohort(false)
    }
  }

  const handleCreateAttioList = async () => {
    if (!preview || preview.users.length === 0) {
      setAttioListError('Run a preview first to find matching users')
      return
    }
    setAttioListError(null)
    setIsCreatingAttioList(true)

    try {
      const emails = preview.users.map(u => u.distinct_id)
      const listName = `Signal: ${name || eventPatterns.join(', ')}`

      const res = await fetch('/api/attio/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: listName,
          emails,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Failed to create Attio list')
      }

      const data: AttioListResult = await res.json()
      setAttioListResult(data)
    } catch (err) {
      setAttioListError(err instanceof Error ? err.message : 'Failed to create Attio list')
    } finally {
      setIsCreatingAttioList(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (eventPatterns.length === 0) return
    setIsSubmitting(true)
    setSubmitError(null)

    try {
      // Create one signal per event
      let firstSignalId: string | null = null

      for (const eventName of eventPatterns) {
        const res = await fetch('/api/signals/custom', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            description,
            event_name: eventName,
            condition_operator: conditionOperator,
            condition_value: Number(conditionValue),
            time_window_days: Number(timeWindow),
          }),
        })

        if (!res.ok) {
          const data = await res.json().catch(() => null)
          throw new Error(data?.error || `Failed to create signal (${res.status})`)
        }

        const data = await res.json()
        if (!firstSignalId) {
          // POST /api/signals/custom returns { signal_definition: {...} } — read the
          // definition id (not data.signal, which doesn't exist) so sync targets attach.
          firstSignalId = data.signal_definition?.id ?? null
        }
      }

      // Build sync targets from the chosen destination.
      // - posthog_cohort / attio_list: existing imperative flow — only attach when
      //   the resource was created AND auto-update is on.
      // - hubspot: object type travels in external_id (see destination-target.ts +
      //   sync-signals/route.ts). No pre-created resource needed.
      if (firstSignalId) {
        const targets: Array<{ type: string; external_id: string; external_name?: string; auto: boolean }> = []

        if (autoUpdateCohort && cohortResult) {
          targets.push({
            type: 'posthog_cohort',
            external_id: String(cohortResult.cohort_id),
            external_name: cohortResult.cohort_name,
            auto: autoUpdateCohort,
          })
        }
        if (autoUpdateAttioList && attioListResult) {
          targets.push({
            type: 'attio_list',
            external_id: attioListResult.list_id,
            external_name: attioListResult.list_name,
            auto: autoUpdateAttioList,
          })
        }
        if (destination === 'hubspot' && hubspotConnected) {
          const hsTarget = buildHubSpotTarget(hubspotObject)
          targets.push({
            type: hsTarget.type,
            external_id: hsTarget.external_id,
            external_name: hsTarget.external_name,
            auto: hsTarget.auto_update,
          })
        }

        for (const target of targets) {
          await fetch('/api/signals/custom', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              signal_definition_id: firstSignalId,
              event_names: eventPatterns,
              condition_operator: conditionOperator,
              condition_value: Number(conditionValue),
              time_window_days: Number(timeWindow),
              target: {
                type: target.type,
                external_id: target.external_id,
                external_name: target.external_name,
                auto_update: target.auto,
              },
            }),
          }).catch(err => {
            console.error('Failed to create sync target (non-blocking):', err)
          })
        }
      }

      router.push('/signals')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create signal')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Back link */}
      <Link href="/signals" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Signals
      </Link>

      <div>
        <h1 className="text-2xl font-bold">Create New Signal</h1>
        <p className="text-muted-foreground">
          Define a product usage pattern to identify high-intent users
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Signal Name</label>
              <Input
                placeholder="e.g., Pricing Page Interest"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Description (optional)</label>
              <Input
                placeholder="What does this signal indicate?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Event Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Events</CardTitle>
            <CardDescription>Select one or more PostHog events to track</CardDescription>
          </CardHeader>
          <CardContent>
            <EventPicker
              value={eventPatterns}
              onChange={(val) => {
                setEventPatterns(val)
                setPreview(null)
                setPreviewError(null)
              }}
            />
          </CardContent>
        </Card>

        {/* Condition */}
        {eventPatterns.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Condition</CardTitle>
              <CardDescription>Define when this signal fires</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Event count</span>
                <select
                  value={conditionOperator}
                  onChange={(e) => setConditionOperator(e.target.value)}
                  className="h-9 px-3 text-sm"
                >
                  {CONDITION_OPERATORS.map(op => (
                    <option key={op.id} value={op.id}>{op.label}</option>
                  ))}
                </select>
                <Input
                  type="number"
                  min="1"
                  max="10000"
                  value={conditionValue}
                  onChange={(e) => setConditionValue(e.target.value)}
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">in last</span>
                <Input
                  type="number"
                  min="1"
                  max="365"
                  value={timeWindow}
                  onChange={(e) => setTimeWindow(e.target.value)}
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">days</span>
              </div>

              {/* Condition summary */}
              {conditionSummary() && (
                <p className="text-sm text-muted-foreground bg-muted/50 px-3 py-2 rounded-md">
                  {conditionSummary()}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Preview */}
        {eventPatterns.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Preview</CardTitle>
              <CardDescription>See which users match this signal</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Stale banner */}
              {isStale && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-warning/10 border border-warning/20">
                  <p className="text-sm text-warning-foreground">
                    Conditions changed since last preview
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handlePreview}
                    disabled={isPreviewing}
                  >
                    Rerun
                  </Button>
                </div>
              )}

              {preview ? (
                <>
                  {/* Aggregate stats */}
                  <div className="flex items-center gap-4 text-sm p-3 bg-primary/5 rounded-lg border border-primary/20">
                    <div>
                      <span className="text-muted-foreground">Last 7d:</span>{' '}
                      <span className="font-bold text-primary">{formatNumber(preview.aggregate.count_7d)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Last 30d:</span>{' '}
                      <span className="font-bold text-primary">{formatNumber(preview.aggregate.count_30d)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Total (90d):</span>{' '}
                      <span className="font-bold">{formatNumber(preview.aggregate.total_count)}</span>
                    </div>
                  </div>

                  {/* User table */}
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 border-b border-border">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">#</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">User</th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground">Events</th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground">Profile</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.users.map((user, i) => (
                          <tr key={user.distinct_id} className="border-b border-border last:border-0">
                            <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                            <td className="px-3 py-2 font-mono text-xs truncate max-w-[200px]">
                              {user.distinct_id}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Badge variant="secondary">{formatNumber(user.event_count)}</Badge>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <a
                                href={user.profile_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline text-xs"
                              >
                                View
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Showing {preview.users.length} of {formatNumber(preview.total_matching_users)} matching users
                  </p>

                  {/* Action buttons */}
                  <div className="space-y-3 p-4 bg-muted/30 rounded-lg border border-border">
                    {/* PostHog cohort */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleCreateCohort}
                          disabled={isCreatingCohort || !!cohortResult}
                        >
                          {isCreatingCohort ? 'Creating...' : cohortResult ? 'Cohort Created' : 'Create PostHog Cohort'}
                        </Button>
                        {cohortResult && (
                          <a
                            href={cohortResult.cohort_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary text-xs hover:underline"
                          >
                            Open in PostHog
                          </a>
                        )}
                        {!cohortResult ? (
                          <Tooltip>
                            <TooltipTrigger
                              render={<span />}
                              className="ml-auto"
                            >
                              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-not-allowed opacity-60">
                                <Checkbox
                                  checked={autoUpdateCohort}
                                  disabled
                                />
                                Auto-update
                              </label>
                            </TooltipTrigger>
                            <TooltipContent>Create the cohort first to enable auto-update</TooltipContent>
                          </Tooltip>
                        ) : (
                          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer ml-auto">
                            <Checkbox
                              checked={autoUpdateCohort}
                              onCheckedChange={(checked) => setAutoUpdateCohort(checked === true)}
                            />
                            Auto-update
                          </label>
                        )}
                      </div>
                      {cohortError && (
                        <p className="text-xs text-destructive">{cohortError}</p>
                      )}
                    </div>

                    {/* Attio list (only if connected) */}
                    {attioConnected && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-3">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleCreateAttioList}
                            disabled={isCreatingAttioList || !!attioListResult}
                          >
                            {isCreatingAttioList ? 'Creating...' : attioListResult ? 'List Created' : 'Save to Attio List'}
                          </Button>
                          {attioListResult && (
                            <span className="text-xs text-muted-foreground">
                              {attioListResult.entries_added} people added
                              {attioListResult.entries_failed > 0 && (
                                <span className="text-destructive"> ({attioListResult.entries_failed} failed)</span>
                              )}
                            </span>
                          )}
                          {!attioListResult ? (
                            <Tooltip>
                              <TooltipTrigger
                                render={<span />}
                                className="ml-auto"
                              >
                                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-not-allowed opacity-60">
                                  <Checkbox
                                    checked={autoUpdateAttioList}
                                    disabled
                                  />
                                  Auto-update
                                </label>
                              </TooltipTrigger>
                              <TooltipContent>Create the list first to enable auto-update</TooltipContent>
                            </Tooltip>
                          ) : (
                            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer ml-auto">
                              <Checkbox
                                checked={autoUpdateAttioList}
                                onCheckedChange={(checked) => setAutoUpdateAttioList(checked === true)}
                              />
                              Auto-update
                            </label>
                          )}
                        </div>
                        {attioListError && (
                          <p className="text-xs text-destructive">{attioListError}</p>
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : previewError ? (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <p className="text-sm text-destructive">{previewError}</p>
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Preview which users match this signal definition
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handlePreview}
                    disabled={isPreviewing}
                  >
                    {isPreviewing ? (
                      <>
                        <span className="animate-spin mr-2 inline-block w-3 h-3 border border-current border-t-transparent rounded-full" />
                        Querying...
                      </>
                    ) : (
                      'Preview Matches'
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Route to — destination picker */}
        {eventPatterns.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Route to</CardTitle>
              <CardDescription>
                Choose where matching identities are written when this signal fires.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <fieldset>
                <legend className="sr-only">Signal destination</legend>
                <div role="radiogroup" aria-label="Signal destination" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {([
                    { id: 'posthog_cohort', name: 'PostHog cohort', initials: 'P', desc: 'Maintain an auto-updating cohort.', connected: true },
                    { id: 'attio_list', name: 'Attio list', initials: 'A', desc: 'Append entries to a curated list.', connected: attioConnected },
                    { id: 'hubspot', name: 'HubSpot', initials: 'H', desc: 'Upsert a contact or company.', connected: hubspotConnected },
                  ] as const).map((d) => {
                    const selected = destination === d.id
                    return (
                      <button
                        key={d.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-disabled={!d.connected}
                        disabled={!d.connected}
                        onClick={() => d.connected && setDestination(d.id)}
                        className={cn(
                          'flex flex-col gap-2 rounded-lg border-2 p-4 text-left transition-all',
                          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                          selected ? 'border-foreground shadow-[3px_3px_0_var(--color-foreground)]' : 'border-border',
                          d.connected ? 'cursor-pointer hover:border-foreground/60' : 'cursor-not-allowed opacity-55',
                        )}
                      >
                        <div className="flex items-start justify-between">
                          <span className="flex h-7 w-7 items-center justify-center border-2 border-foreground font-heading text-sm font-bold">
                            {d.initials}
                          </span>
                          {selected && (
                            <span className="flex h-5 w-5 items-center justify-center bg-foreground text-background">
                              <Check className="h-3 w-3" />
                            </span>
                          )}
                        </div>
                        <span className="text-sm font-bold uppercase tracking-wide">{d.name}</span>
                        <span className="text-xs text-muted-foreground">{d.desc}</span>
                        {!d.connected && (
                          <span className="mt-auto inline-flex items-center gap-1.5 text-xs font-semibold text-destructive">
                            <AlertCircle className="h-3 w-3" />
                            Not connected —{' '}
                            <Link href="/setup" className="underline">connect first</Link>
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              {/* PostHog / Attio: the create buttons in the Preview section above
                  drive these destinations. */}
              {(destination === 'posthog_cohort' || destination === 'attio_list') && (
                <p className="text-xs text-muted-foreground">
                  Run a preview above, then use{' '}
                  <span className="font-medium">
                    {destination === 'posthog_cohort' ? '“Create PostHog Cohort”' : '“Save to Attio List”'}
                  </span>{' '}
                  and toggle Auto-update to keep this destination synced.
                </p>
              )}

              {/* HubSpot sub-config: object-type selector */}
              {destination === 'hubspot' && (
                <div className="space-y-3 rounded-lg border-2 border-foreground bg-[#FF7A59]/5 p-4">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider">
                    <span className="flex h-5 w-5 items-center justify-center border-2 border-foreground bg-[#FF7A59]/10 text-[10px]">H</span>
                    HubSpot — object type
                  </div>
                  <fieldset>
                    <legend className="sr-only">HubSpot object type</legend>
                    <div role="radiogroup" aria-label="HubSpot object type" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {([
                        { id: 'contact', label: 'Contact', desc: 'upsert on email' },
                        { id: 'company', label: 'Company', desc: 'upsert on domain' },
                      ] as const).map((o) => {
                        const sel = hubspotObject === o.id
                        return (
                          <button
                            key={o.id}
                            type="button"
                            role="radio"
                            aria-checked={sel}
                            onClick={() => setHubspotObject(o.id)}
                            className={cn(
                              'rounded-md border-2 bg-background p-3 text-left transition-all',
                              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                              sel ? 'border-foreground shadow-[3px_3px_0_var(--color-foreground)]' : 'border-border hover:border-foreground/60',
                            )}
                          >
                            <div className="text-sm font-bold uppercase tracking-wide">{o.label}</div>
                            <div className="mt-1 font-mono text-[11px] text-muted-foreground">{o.desc}</div>
                          </button>
                        )
                      })}
                    </div>
                  </fieldset>
                  <Link
                    href="/settings/integrations/hubspot/field-mapping"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    Edit HubSpot field mapping
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Submit error */}
        {submitError && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <p className="text-sm text-destructive">{submitError}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col items-end gap-2">
          {(!name || eventPatterns.length === 0) && (
            <p className="text-xs text-muted-foreground">
              {!name && eventPatterns.length === 0
                ? 'Enter a signal name and select at least one event to continue'
                : !name
                  ? 'Enter a signal name to continue'
                  : 'Select at least one event to continue'}
            </p>
          )}
          <div className="flex gap-3">
            <Link href="/signals">
              <Button type="button" variant="outline">Cancel</Button>
            </Link>
            <Button
              type="submit"
              disabled={!name || eventPatterns.length === 0 || isSubmitting}
            >
              {isSubmitting ? 'Creating...' : 'Create Signal'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
