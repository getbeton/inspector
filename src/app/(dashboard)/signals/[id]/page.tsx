'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { trackFirstSignalViewed } from '@/lib/analytics'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendChart, ConversionChart } from '@/components/charts'
import { MOCK_SIGNALS } from '@/lib/data/mock-signals'
import { useSetupStatus } from '@/lib/hooks/use-setup-status'
import { useRealSignal, useDeleteSignal } from '@/lib/hooks/use-signals'
import { cn } from '@/lib/utils/cn'

/** Shape used for rendering — unifies mock and real data */
interface SignalView {
  id: string
  name: string
  description: string
  status: 'active' | 'draft'
  source: 'Beton-Discovered' | 'User-Defined'
  // Event definition
  event: string
  condition: string
  time_window_days: number
  created_at: string
  // Metrics (-1 = pending)
  lift: number
  confidence: number
  leads_per_month: number
  estimated_arr: number
  conversion_with: number
  conversion_without: number
  sample_with: number
  sample_without: number
  // Charts
  trend_data: number[]
  accuracy_trend: number[]
  // Deltas (mock only)
  trend_delta: string
  confidence_delta: string
  leads_delta: string
  arr_delta: string
  // Match count
  match_count_7d: number
  match_count_30d: number
  match_count_total: number
}

export default function SignalDetailPage() {
  const params = useParams()
  const router = useRouter()
  const signalId = params.id as string

  const [showBreakdown, setShowBreakdown] = useState(false)
  const [showTrend, setShowTrend] = useState(true)

  const { data: setupStatus } = useSetupStatus()
  const isDemo = !setupStatus || !setupStatus.setupComplete
  const deleteMutation = useDeleteSignal()

  // Fetch real signal data (only when setup is complete)
  const { data: realData, isLoading, isError } = useRealSignal(
    isDemo ? '' : signalId
  )

  // Track first signal viewed
  useEffect(() => {
    if (signalId) {
      trackFirstSignalViewed(signalId)
    }
  }, [signalId])

  // Build unified view from either mock or real data
  const signal = useMemo<SignalView | null>(() => {
    if (isDemo) {
      // Demo mode: use mock data
      const mock = MOCK_SIGNALS.find(s => s.id === signalId)
      if (!mock) return null
      return {
        id: mock.id,
        name: mock.name,
        description: `Users who ${mock.name.toLowerCase()}`,
        status: mock.status,
        source: mock.source,
        event: mock.name.toLowerCase().replace(/ /g, '_'),
        condition: 'count >= 1',
        time_window_days: 7,
        created_at: '2024-12-15T00:00:00Z',
        lift: mock.lift,
        confidence: mock.confidence,
        leads_per_month: mock.leads_per_month,
        estimated_arr: mock.estimated_arr,
        conversion_with: mock.conversion_with,
        conversion_without: mock.conversion_without,
        sample_with: mock.sample_with,
        sample_without: mock.sample_without,
        trend_data: mock.trend_data,
        accuracy_trend: mock.accuracy_trend,
        trend_delta: '+0.3x',
        confidence_delta: '+2%',
        leads_delta: '+5',
        arr_delta: '+$42K',
        match_count_7d: mock.leads_per_month * 2,
        match_count_30d: mock.leads_per_month * 7,
        match_count_total: mock.leads_per_month * 30,
      }
    }

    // Real mode: use API data
    if (!realData?.signal) return null
    const s = realData.signal
    const details = s.details || {}
    const m = realData.metrics
    const matchCount = details.match_count as { total_count?: number; count_7d?: number; count_30d?: number } | undefined

    return {
      id: s.id,
      name: (details.name as string) || s.type,
      description: (details.description as string) || '',
      status: 'active',
      source: s.source === 'manual' ? 'User-Defined' : 'Beton-Discovered',
      event: (details.event_name as string) || s.type.replace('custom:', ''),
      condition: formatCondition(
        (details.condition_operator as string) || 'gte',
        (details.condition_value as number) || 1
      ),
      time_window_days: (details.time_window_days as number) || 7,
      created_at: s.created_at,
      // Metrics from signal_aggregates (or -1 for pending)
      lift: m?.lift ?? -1,
      confidence: m?.confidence ?? -1,
      leads_per_month: m?.count_30d ? Math.round(m.count_30d / 4.3) : 0,
      estimated_arr: 0, // Not calculated for manual signals
      conversion_with: m?.conversion_rate ?? -1,
      conversion_without: m ? (m.lift && m.conversion_rate ? m.conversion_rate / m.lift : -1) : -1,
      sample_with: m?.sample_size ?? 0,
      sample_without: 0,
      trend_data: [0],
      accuracy_trend: [0],
      trend_delta: '--',
      confidence_delta: '--',
      leads_delta: '--',
      arr_delta: '--',
      match_count_7d: matchCount?.count_7d ?? m?.count_7d ?? 0,
      match_count_30d: matchCount?.count_30d ?? m?.count_30d ?? 0,
      match_count_total: matchCount?.total_count ?? m?.total_count ?? 0,
    }
  }, [isDemo, signalId, realData])

  const handleDelete = async () => {
    if (!signal) return
    if (!confirm(`Delete signal "${signal.name}"?`)) return
    try {
      await deleteMutation.mutateAsync(signal.id)
      router.push('/signals')
    } catch {
      // mutation error handled by React Query
    }
  }

  // Loading state (real mode only)
  if (!isDemo && isLoading) {
    return (
      <div className="space-y-6">
        <Link href="/signals" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Signals
        </Link>
        <Card>
          <CardContent className="py-12 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-muted-foreground">Loading signal...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Error or not found
  if (!signal || (!isDemo && isError)) {
    return (
      <div className="space-y-6">
        <Link href="/signals" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Signals
        </Link>
        <Card>
          <CardContent className="py-12 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium mb-2">Signal not found</h3>
            <p className="text-muted-foreground mb-4">
              The signal you&apos;re looking for doesn&apos;t exist or has been removed.
            </p>
            <Link href="/signals">
              <Button variant="outline">Back to Signals</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const hasPendingMetrics = signal.lift < 0
  const hasConversionData = signal.conversion_with >= 0 && signal.conversion_without >= 0
  const hasHistoricalData = signal.accuracy_trend.length > 1

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link href="/signals" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Signals
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{signal.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge
              variant={signal.status === 'active' ? 'default' : 'secondary'}
              className={cn(
                signal.status === 'active'
                  ? 'bg-success/10 text-success border-success/20'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {signal.status}
            </Badge>
            <span className="text-sm text-muted-foreground">·</span>
            <Badge
              variant="outline"
              className={cn(
                signal.source === 'Beton-Discovered'
                  ? 'border-primary/30 text-primary'
                  : 'border-muted-foreground/30 text-muted-foreground'
              )}
            >
              {signal.source === 'Beton-Discovered' ? 'Auto' : 'Custom'}
            </Badge>
            {hasPendingMetrics && (
              <>
                <span className="text-sm text-muted-foreground">·</span>
                <Badge variant="secondary" className="text-xs">Metrics Pending</Badge>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isDemo && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          )}
        </div>
      </div>

      {/* Match Count Cards (always available — calculated on creation) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Total Matches"
          value={formatNumber(signal.match_count_total)}
          help="Total event occurrences in the last 90 days"
        />
        <MetricCard
          label="Last 30 days"
          value={formatNumber(signal.match_count_30d)}
          help="Event occurrences in the last 30 days"
        />
        <MetricCard
          label="Last 7 days"
          value={formatNumber(signal.match_count_7d)}
          help="Event occurrences in the last 7 days"
        />
        {hasPendingMetrics ? (
          <MetricCard
            label="Lift"
            value="Pending"
            pending
            help="How many times more likely to convert vs baseline"
          />
        ) : (
          <MetricCard
            label="Lift"
            value={`${signal.lift.toFixed(1)}x`}
            delta={signal.trend_delta !== '--' ? signal.trend_delta : undefined}
            deltaPositive={signal.trend_delta.startsWith('+')}
            help="How many times more likely to convert vs baseline"
          />
        )}
      </div>

      {/* Additional metrics row (only when calculated) */}
      {!hasPendingMetrics && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <MetricCard
            label="Confidence"
            value={`${(signal.confidence * 100).toFixed(0)}%`}
            delta={signal.confidence_delta !== '--' ? signal.confidence_delta : undefined}
            deltaPositive={signal.confidence_delta?.startsWith('+')}
            help="Statistical certainty (>95% = reliable)"
          />
          <MetricCard
            label="Leads/mo"
            value={signal.leads_per_month.toString()}
            delta={signal.leads_delta !== '--' ? signal.leads_delta : undefined}
            deltaPositive={signal.leads_delta?.startsWith('+')}
            help="Users matching this signal pattern per month"
          />
          {signal.estimated_arr > 0 && (
            <MetricCard
              label="ARR Impact"
              value={formatCurrency(signal.estimated_arr)}
              delta={signal.arr_delta !== '--' ? signal.arr_delta : undefined}
              deltaPositive={signal.arr_delta?.startsWith('+')}
              help="Projected annual revenue from this signal"
            />
          )}
        </div>
      )}

      {/* Conversion Comparison (only when conversion data exists) */}
      {hasConversionData && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Conversion Comparison</CardTitle>
            <CardDescription>
              Conversion rate comparison between users with and without this signal
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConversionChart
              conversionWith={signal.conversion_with}
              conversionWithout={signal.conversion_without}
              sampleWith={signal.sample_with}
              sampleWithout={signal.sample_without}
              height={140}
            />

            <button
              onClick={() => setShowBreakdown(!showBreakdown)}
              className="mt-4 text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <svg className={cn("w-4 h-4 transition-transform", showBreakdown && "rotate-90")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {showBreakdown ? 'Hide' : 'Show'} detailed breakdown
            </button>

            {showBreakdown && (
              <div className="mt-4 pt-4 border-t border-border">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="font-medium mb-2">With Signal</p>
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <p>Users: {formatNumber(signal.sample_with)}</p>
                      <p>Converted: {formatNumber(Math.round(signal.sample_with * signal.conversion_with))}</p>
                      <p>Rate: {(signal.conversion_with * 100).toFixed(2)}%</p>
                    </div>
                  </div>
                  <div>
                    <p className="font-medium mb-2">Without Signal</p>
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <p>Users: {formatNumber(signal.sample_without)}</p>
                      <p>Converted: {formatNumber(Math.round(signal.sample_without * signal.conversion_without))}</p>
                      <p>Rate: {(signal.conversion_without * 100).toFixed(2)}%</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Historical Accuracy (only when trend data exists) */}
      {hasHistoricalData && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Historical Accuracy</CardTitle>
                <CardDescription>Signal performance over the last 6 months</CardDescription>
              </div>
              <button
                onClick={() => setShowTrend(!showTrend)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                {showTrend ? 'Hide' : 'Show'}
              </button>
            </div>
          </CardHeader>
          {showTrend && (
            <CardContent>
              <TrendChart
                data={signal.accuracy_trend}
                height={220}
                showAverage={true}
              />
              <div className="mt-4 flex items-center justify-between text-sm border-t border-border pt-3">
                <div>
                  <span className="text-muted-foreground">Current:</span>
                  <span className="ml-1 font-bold text-foreground">{(signal.accuracy_trend[signal.accuracy_trend.length - 1] * 100).toFixed(0)}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground">6-month avg:</span>
                  <span className="ml-1 font-bold text-foreground">{(signal.accuracy_trend.reduce((a, b) => a + b, 0) / signal.accuracy_trend.length * 100).toFixed(0)}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Trend:</span>
                  <span className={cn(
                    "ml-1 font-bold",
                    signal.accuracy_trend[signal.accuracy_trend.length - 1] >= signal.accuracy_trend[0]
                      ? "text-success"
                      : "text-destructive"
                  )}>
                    {signal.accuracy_trend[signal.accuracy_trend.length - 1] >= signal.accuracy_trend[0] ? 'Improving' : 'Declining'}
                  </span>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Signal Definition */}
      <CollapsibleSection title="Signal Definition" defaultOpen={!isDemo}>
        <div className="grid grid-cols-2 gap-4 mb-3">
          <div>
            <p className="text-sm text-muted-foreground">
              Event: <code className="bg-muted px-1 rounded-sm">{signal.event}</code>
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Condition: <code className="bg-muted px-1 rounded-sm">{signal.condition}</code>
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Source: {signal.source}</p>
            <p className="text-sm text-muted-foreground mt-1">
              Time window: {signal.time_window_days} days
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Created: {new Date(signal.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
        {signal.description && (
          <p className="text-sm text-muted-foreground">{signal.description}</p>
        )}
      </CollapsibleSection>

      {/* Understanding Metrics */}
      <CollapsibleSection title="Understanding These Metrics">
        <div className="space-y-3 text-sm text-muted-foreground">
          <p><strong className="text-foreground">Match Count:</strong> How many times this event occurred in the given time window. Calculated instantly when the signal is created.</p>
          <p><strong className="text-foreground">Lift:</strong> How many times more likely users are to convert compared to baseline. A 4x lift means users with this signal convert 4 times more often.</p>
          <p><strong className="text-foreground">Confidence:</strong> Statistical certainty of the result. &gt;95% means we&apos;re highly confident this signal is real, not random noise.</p>
          <p><strong className="text-foreground">Leads/mo:</strong> Number of users matching this signal pattern per month. Higher volume = more actionable signal.</p>
        </div>
      </CollapsibleSection>
    </div>
  )
}

// ────────────────────────────────────────────────
// Helper components
// ────────────────────────────────────────────────

function MetricCard({ label, value, delta, deltaPositive, help, pending }: {
  label: string
  value: string
  delta?: string
  deltaPositive?: boolean
  help?: string
  pending?: boolean
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{label}</p>
          {help && (
            <span title={help}>
              <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
          )}
        </div>
        {pending ? (
          <div className="mt-1">
            <Badge variant="secondary" className="text-xs">Pending</Badge>
          </div>
        ) : (
          <>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {delta && (
              <p className={cn(
                "text-sm mt-1",
                deltaPositive ? "text-success" : "text-destructive"
              )}>
                {delta}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function CollapsibleSection({ title, children, defaultOpen = false }: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <Card>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-muted/50 transition-colors"
      >
        <span className="font-medium">{title}</span>
        <svg
          className={cn("w-5 h-5 text-muted-foreground transition-transform", isOpen && "rotate-180")}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <CardContent className="pt-0 pb-4">
          {children}
        </CardContent>
      )}
    </Card>
  )
}

// ────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────

function formatCondition(operator: string, value: number): string {
  const opMap: Record<string, string> = {
    gte: '>=', gt: '>', eq: '=', lt: '<', lte: '<='
  }
  return `count ${opMap[operator] || '>='} ${value}`
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat().format(n)
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(n)
}
