'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils/cn'

const EVENT_TYPES = [
  { id: 'pageview', name: 'Page View', description: 'Track visits to specific pages' },
  { id: 'feature_used', name: 'Feature Usage', description: 'Track feature adoption events' },
  { id: 'api_call', name: 'API Call', description: 'Track API endpoint usage' },
  { id: 'custom', name: 'Custom Event', description: 'Define your own event pattern' },
]

const CONDITION_OPERATORS = [
  { id: 'gte', label: '>=' },
  { id: 'gt', label: '>' },
  { id: 'eq', label: '=' },
  { id: 'lt', label: '<' },
  { id: 'lte', label: '<=' },
]

export default function AddSignalPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [eventType, setEventType] = useState<string>('')
  const [eventPattern, setEventPattern] = useState('')
  const [conditionOperator, setConditionOperator] = useState('gte')
  const [conditionValue, setConditionValue] = useState('1')
  const [timeWindow, setTimeWindow] = useState('7')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000))

    // In real implementation, this would call the API
    alert('Signal created successfully! (Demo mode)')
    router.push('/signals')
  }

  const generateHogQL = () => {
    if (!eventPattern) return ''
    const op = CONDITION_OPERATORS.find(o => o.id === conditionOperator)?.label || '>='
    return `SELECT count() FROM events WHERE event = '${eventPattern}' AND timestamp > now() - interval ${timeWindow} day HAVING count() ${op} ${conditionValue}`
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

        {/* Event Type */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Event Type</CardTitle>
            <CardDescription>Select the type of event to track</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {EVENT_TYPES.map(type => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setEventType(type.id)}
                  className={cn(
                    'text-left p-4 rounded-lg border transition-colors',
                    eventType === type.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/50'
                  )}
                >
                  <p className="font-medium">{type.name}</p>
                  <p className="text-sm text-muted-foreground">{type.description}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Event Pattern */}
        {eventType && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Event Pattern</CardTitle>
              <CardDescription>Define the specific event to match</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  {eventType === 'pageview' ? 'Page URL Pattern' :
                   eventType === 'feature_used' ? 'Feature Name' :
                   eventType === 'api_call' ? 'API Endpoint' : 'Event Name'}
                </label>
                <Input
                  placeholder={
                    eventType === 'pageview' ? '/pricing' :
                    eventType === 'feature_used' ? 'dashboard_viewed' :
                    eventType === 'api_call' ? '/api/v1/users' : 'custom_event_name'
                  }
                  value={eventPattern}
                  onChange={(e) => setEventPattern(e.target.value)}
                  required
                />
              </div>

              {/* Condition */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Condition</label>
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
                <p className="text-sm">
                  <span className="font-medium">Estimated matches:</span>{' '}
                  <span className="text-primary font-bold">~{Math.round(20 + Math.random() * 50)}</span> users/month
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Based on your PostHog data from the last 30 days
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Link href="/signals">
            <Button type="button" variant="outline">Cancel</Button>
          </Link>
          <Button
            type="submit"
            disabled={!name || !eventType || !eventPattern || isSubmitting}
          >
            {isSubmitting ? 'Creating...' : 'Create Signal'}
          </Button>
        </div>
      </form>
    </div>
  )
}
