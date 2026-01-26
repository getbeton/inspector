'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendChart, ConversionChart } from '@/components/charts'
import { MOCK_SIGNALS } from '@/lib/data/mock-signals'
import { cn } from '@/lib/utils/cn'

// Extended signal data for detail view
interface SignalDetail {
  id: string
  name: string
  status: 'active' | 'draft'
  lift: number
  confidence: number
  leads_per_month: number
  estimated_arr: number
  source: 'Beton-Discovered' | 'User-Defined'
  trend_30d: string
  sample_with: number
  sample_without: number
  conversion_with: number
  conversion_without: number
  trend_data: number[]
  accuracy_trend: number[]
  // Extended fields
  description: string
  event: string
  condition: string
  ci_lower: number
  ci_upper: number
  p_value: number
  health: 'healthy' | 'needs_attention'
  trend_delta: string
  confidence_delta: string
  leads_delta: string
  arr_delta: string
}

export default function SignalDetailPage() {
  const params = useParams()
  const signalId = params.id as string

  const [showBreakdown, setShowBreakdown] = useState(false)
  const [showTrend, setShowTrend] = useState(true)

  // Get signal data (mock for now)
  const signal = useMemo<SignalDetail | null>(() => {
    const baseSignal = MOCK_SIGNALS.find(s => s.id === signalId)
    if (!baseSignal) return null

    // Enrich with detail fields
    return {
      ...baseSignal,
      description: `Users who ${baseSignal.name.toLowerCase()}`,
      event: baseSignal.name.toLowerCase().replace(/ /g, '_'),
      condition: 'count >= 1',
      ci_lower: baseSignal.lift - 0.5,
      ci_upper: baseSignal.lift + 0.5,
      p_value: 0.001,
      health: 'healthy' as const,
      trend_delta: '+0.3x',
      confidence_delta: '+2%',
      leads_delta: '+5',
      arr_delta: '+$42K'
    }
  }, [signalId])

  if (!signal) {
    return (
      <div className="space-y-6">
        <Link href="/signals" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to Signals
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
              The signal you're looking for doesn't exist or has been removed.
            </p>
            <Link href="/signals">
              <Button variant="outline">Back to Signals</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const formatCurrency = (n: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(n)
  }

  const formatPercent = (n: number) => `${(n * 100).toFixed(1)}%`
  const formatNumber = (n: number) => new Intl.NumberFormat().format(n)

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
            <span className="text-sm text-muted-foreground">•</span>
            <span className="text-sm text-muted-foreground">
              {signal.health === 'healthy' ? 'Healthy' : 'Needs Attention'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            {signal.status === 'active' ? 'Disable' : 'Enable'}
          </Button>
          <Button variant="outline" size="sm">
            Edit
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Lift"
          value={`${signal.lift}x`}
          delta={signal.trend_delta}
          deltaPositive={signal.trend_delta.startsWith('+')}
          help="How many times more likely to convert vs baseline"
        />
        <MetricCard
          label="Confidence"
          value={`${(signal.confidence * 100).toFixed(0)}%`}
          delta={signal.confidence_delta}
          deltaPositive={signal.confidence_delta.startsWith('+')}
          help="Statistical certainty (>95% = reliable)"
        />
        <MetricCard
          label="Leads/mo"
          value={signal.leads_per_month.toString()}
          delta={signal.leads_delta}
          deltaPositive={signal.leads_delta.startsWith('+')}
          help="Users matching this signal pattern per month"
        />
        <MetricCard
          label="ARR Impact"
          value={`$${Math.round(signal.estimated_arr / 1000)}K`}
          delta={signal.arr_delta}
          deltaPositive={signal.arr_delta.startsWith('+')}
          help="Projected annual revenue from this signal"
        />
      </div>

      {/* Conversion Comparison */}
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

          {/* Toggle for detailed breakdown */}
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
              <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-border text-sm">
                <div>
                  <span className="text-muted-foreground">Lift:</span>
                  <span className="ml-1 font-medium">{signal.lift}x</span>
                </div>
                <div>
                  <span className="text-muted-foreground">95% CI:</span>
                  <span className="ml-1 font-medium">{signal.ci_lower.toFixed(1)}x - {signal.ci_upper.toFixed(1)}x</span>
                </div>
                <div>
                  <span className="text-muted-foreground">p-value:</span>
                  <span className="ml-1 font-medium">&lt; {signal.p_value}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Confidence:</span>
                  <span className="ml-1 font-medium">{formatPercent(signal.confidence)}</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Historical Accuracy */}
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
                  {signal.accuracy_trend[signal.accuracy_trend.length - 1] >= signal.accuracy_trend[0] ? '↑ Improving' : '↓ Declining'}
                </span>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Signal Definition (Collapsible) */}
      <CollapsibleSection title="Signal Definition">
        <div className="grid grid-cols-2 gap-4 mb-3">
          <div>
            <p className="text-sm text-muted-foreground">Event: <code className="bg-muted px-1 rounded-sm">{signal.event}</code></p>
            <p className="text-sm text-muted-foreground mt-1">Condition: <code className="bg-muted px-1 rounded-sm">{signal.condition}</code></p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Source: {signal.source}</p>
            <p className="text-sm text-muted-foreground mt-1">Created: Dec 15, 2024</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{signal.description}</p>
      </CollapsibleSection>

      {/* Understanding Metrics (Collapsible) */}
      <CollapsibleSection title="Understanding These Metrics">
        <div className="space-y-3 text-sm text-muted-foreground">
          <p><strong className="text-foreground">Lift:</strong> How many times more likely users are to convert compared to baseline. A 4x lift means users with this signal convert 4 times more often.</p>
          <p><strong className="text-foreground">Confidence:</strong> Statistical certainty of the result. &gt;95% means we're highly confident this signal is real, not random noise.</p>
          <p><strong className="text-foreground">Leads/mo:</strong> Number of users matching this signal pattern per month. Higher volume = more actionable signal.</p>
          <p><strong className="text-foreground">ARR Impact:</strong> Projected annual revenue from prioritizing users with this signal. Based on your ACV and conversion rates.</p>
          <p><strong className="text-foreground">Historical Accuracy:</strong> How well this signal has performed over time. Consistent accuracy indicates a reliable signal.</p>
        </div>
      </CollapsibleSection>

      {/* Action Buttons */}
      <div className="flex gap-4 pt-4 border-t border-border">
        <Button variant="outline" className="flex-1">
          Export Users
        </Button>
      </div>
    </div>
  )
}

// Metric Card Component
function MetricCard({ label, value, delta, deltaPositive, help }: {
  label: string
  value: string
  delta?: string
  deltaPositive?: boolean
  help?: string
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
        <p className="text-2xl font-bold mt-1">{value}</p>
        {delta && (
          <p className={cn(
            "text-sm mt-1",
            deltaPositive ? "text-success" : "text-destructive"
          )}>
            {delta}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// Collapsible Section Component
function CollapsibleSection({ title, children }: { title: string, children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)

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
