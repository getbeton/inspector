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
import { useSetupStatus } from '@/lib/hooks/use-setup-status'

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
  const { data: setupStatus } = useSetupStatus()
  const attioConnected = setupStatus?.integrations?.attio ?? false

  // Form state
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
  const [autoUpdateCohort, setAutoUpdateCohort] = useState(false)
  const [autoUpdateAttioList, setAutoUpdateAttioList] = useState(false)

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
    if (!preview || preview.users.length === 0) return
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
      setPreviewError(err instanceof Error ? err.message : 'Failed to create cohort')
    } finally {
      setIsCreatingCohort(false)
    }
  }

  const handleCreateAttioList = async () => {
    if (!preview || preview.users.length === 0) return
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
      setPreviewError(err instanceof Error ? err.message : 'Failed to create Attio list')
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
          firstSignalId = data.signal?.id
        }
      }

      // If auto-update is enabled and we have a signal + cohort/list, create sync targets
      if (firstSignalId && (autoUpdateCohort || autoUpdateAttioList)) {
        const targets: Array<{ type: string; id: string; name?: string; auto: boolean }> = []

        if (autoUpdateCohort && cohortResult) {
          targets.push({
            type: 'posthog_cohort',
            id: String(cohortResult.cohort_id),
            name: cohortResult.cohort_name,
            auto: autoUpdateCohort,
          })
        }
        if (autoUpdateAttioList && attioListResult) {
          targets.push({
            type: 'attio_list',
            id: attioListResult.list_id,
            name: attioListResult.list_name,
            auto: autoUpdateAttioList,
          })
        }

        for (const target of targets) {
          await fetch('/api/signals/custom', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              signal_id: firstSignalId,
              event_names: eventPatterns,
              condition_operator: conditionOperator,
              condition_value: Number(conditionValue),
              time_window_days: Number(timeWindow),
              target: {
                type: target.type,
                external_id: target.id,
                external_name: target.name,
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
                  className="px-3 py-2 border border-border rounded-md bg-background text-sm"
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
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer ml-auto">
                        <Checkbox
                          checked={autoUpdateCohort}
                          onCheckedChange={(checked) => setAutoUpdateCohort(checked === true)}
                          disabled={!cohortResult}
                        />
                        Auto-update
                      </label>
                    </div>

                    {/* Attio list (only if connected) */}
                    {attioConnected && (
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
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer ml-auto">
                          <Checkbox
                            checked={autoUpdateAttioList}
                            onCheckedChange={(checked) => setAutoUpdateAttioList(checked === true)}
                            disabled={!attioListResult}
                          />
                          Auto-update
                        </label>
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

        {/* Submit error */}
        {submitError && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <p className="text-sm text-destructive">{submitError}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3">
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
      </form>
    </div>
  )
}
