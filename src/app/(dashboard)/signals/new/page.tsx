'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { EventPicker } from '@/components/signals/event-picker'

const CONDITION_OPERATORS = [
  { id: 'gte', label: '>=' },
  { id: 'gt', label: '>' },
  { id: 'eq', label: '=' },
  { id: 'lt', label: '<' },
  { id: 'lte', label: '<=' },
]

interface PreviewResult {
  total_count: number
  count_7d: number
  count_30d: number
}

export default function AddSignalPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [eventPattern, setEventPattern] = useState('')
  const [conditionOperator, setConditionOperator] = useState('gte')
  const [conditionValue, setConditionValue] = useState('1')
  const [timeWindow, setTimeWindow] = useState('7')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const res = await fetch('/api/signals/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          event_name: eventPattern,
          condition_operator: conditionOperator,
          condition_value: Number(conditionValue),
          time_window_days: Number(timeWindow),
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || `Failed to create signal (${res.status})`)
      }

      router.push('/signals')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create signal')
      setIsSubmitting(false)
    }
  }

  const handlePreview = async () => {
    if (!eventPattern) return
    setIsPreviewing(true)
    setPreviewError(null)
    setPreview(null)

    try {
      // Use the custom signal endpoint with a dry-run approach:
      // We only need match count, which is the same query the creation endpoint runs.
      // For preview, we call the PostHog query proxy directly.
      const res = await fetch('/api/posthog/query/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `SELECT count() as total_count, countIf(timestamp >= now() - interval 7 day) as count_7d, countIf(timestamp >= now() - interval 30 day) as count_30d FROM events WHERE event = '${eventPattern.replace(/'/g, "\\'")}' AND timestamp >= now() - interval 90 day`,
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to fetch preview')
      }

      const data = await res.json()
      const row = data.results?.[0]
      if (row) {
        setPreview({
          total_count: Number(row[0]) || 0,
          count_7d: Number(row[1]) || 0,
          count_30d: Number(row[2]) || 0,
        })
      } else {
        setPreview({ total_count: 0, count_7d: 0, count_30d: 0 })
      }
    } catch {
      setPreviewError('Could not fetch preview. Make sure PostHog is connected.')
    } finally {
      setIsPreviewing(false)
    }
  }

  const generateHogQL = () => {
    if (!eventPattern) return ''
    const op = CONDITION_OPERATORS.find(o => o.id === conditionOperator)?.label || '>='
    return `SELECT count() FROM events WHERE event = '${eventPattern}' AND timestamp > now() - interval ${timeWindow} day HAVING count() ${op} ${conditionValue}`
  }

  const formatNumber = (n: number) => new Intl.NumberFormat().format(n)

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
            <CardTitle className="text-lg">Event</CardTitle>
            <CardDescription>Select the PostHog event to track</CardDescription>
          </CardHeader>
          <CardContent>
            <EventPicker
              value={eventPattern}
              onSelect={(val) => {
                setEventPattern(val)
                setPreview(null)
                setPreviewError(null)
              }}
            />
          </CardContent>
        </Card>

        {/* Condition */}
        {eventPattern && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Condition</CardTitle>
              <CardDescription>Define when this signal fires</CardDescription>
            </CardHeader>
            <CardContent>
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
                  value={conditionValue}
                  onChange={(e) => setConditionValue(e.target.value)}
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">in last</span>
                <Input
                  type="number"
                  min="1"
                  value={timeWindow}
                  onChange={(e) => setTimeWindow(e.target.value)}
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">days</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Preview */}
        {eventPattern && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Query Preview</CardTitle>
              <CardDescription>Generated HogQL query</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
                <code>{generateHogQL()}</code>
              </pre>
              <div className="mt-4 p-4 bg-primary/5 rounded-lg border border-primary/20">
                {preview ? (
                  <>
                    <div className="flex items-center gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Last 7 days:</span>{' '}
                        <span className="font-bold text-primary">{formatNumber(preview.count_7d)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Last 30 days:</span>{' '}
                        <span className="font-bold text-primary">{formatNumber(preview.count_30d)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Total (90d):</span>{' '}
                        <span className="font-bold">{formatNumber(preview.total_count)}</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Event occurrences from your PostHog data
                    </p>
                  </>
                ) : previewError ? (
                  <p className="text-sm text-destructive">{previewError}</p>
                ) : (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Preview how many times this event occurred in your data
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
              </div>
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
            disabled={!name || !eventPattern || isSubmitting}
          >
            {isSubmitting ? 'Creating...' : 'Create Signal'}
          </Button>
        </div>
      </form>
    </div>
  )
}
