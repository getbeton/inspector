'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { trackFirstSignalViewed } from '@/lib/analytics'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useSetupStatus } from '@/lib/hooks/use-setup-status'
import { useRealSignal, useDeleteSignal, useSignalAnalytics } from '@/lib/hooks/use-signals'
import { MOCK_SIGNALS } from '@/lib/data/mock-signals'
import { getMockSignalAnalytics } from '@/lib/data/mock-signal-analytics'
import { RevenueChart, DualLineChart, AreaChart, RetentionTable, CHART_COLORS } from '@/components/signals/charts'
import { cn } from '@/lib/utils/cn'
import type { SignalAnalyticsResponse, ConversionWindow, CohortRetention } from '@/lib/api/signals'

// ── Types ──────────────────────────────────────────────────

type RetentionTab = 'users' | 'events' | 'revenue'
type RetentionStat = 'total' | 'avg' | 'median'
type ConvCurveMode = 'cumulative' | 'period'

// ── Page ───────────────────────────────────────────────────

export default function SignalDetailPage() {
  const params = useParams()
  const router = useRouter()
  const signalId = params.id as string

  const { data: setupStatus } = useSetupStatus()
  const isDemo = !setupStatus || !setupStatus.setupComplete
  const deleteMutation = useDeleteSignal()

  // Filter state
  const [convWindow, setConvWindow] = useState<ConversionWindow>(30)
  const [range, setRange] = useState<'3m' | '6m' | '12m' | 'all'>('12m')

  // Chart state
  const [retTab, setRetTab] = useState<RetentionTab>('users')
  const [retStat, setRetStat] = useState<RetentionStat>('total')
  const [convCurveMode, setConvCurveMode] = useState<ConvCurveMode>('cumulative')

  // Fetch signal definition (for header info)
  const { data: realData, isLoading, isError } = useRealSignal(isDemo ? '' : signalId)

  // Fetch analytics data
  const { data: analyticsData } = useSignalAnalytics(
    isDemo ? '' : signalId,
    isDemo ? undefined : { conversion_window: convWindow, range }
  )

  // Track first view
  useEffect(() => {
    if (signalId) trackFirstSignalViewed(signalId)
  }, [signalId])

  // Build analytics from either mock or real data
  const analytics: SignalAnalyticsResponse | null = useMemo(() => {
    if (isDemo) {
      return getMockSignalAnalytics(signalId, convWindow)
    }
    return analyticsData ?? null
  }, [isDemo, signalId, convWindow, analyticsData])

  // Signal name/metadata
  const signalName = useMemo(() => {
    if (isDemo) {
      const mock = MOCK_SIGNALS.find(s => s.id === signalId)
      return mock?.name || 'Unknown Signal'
    }
    if (realData?.signal) {
      const details = realData.signal.details || {}
      return (details.name as string) || realData.signal.type
    }
    return 'Loading...'
  }, [isDemo, signalId, realData])

  const signalSource = useMemo(() => {
    if (isDemo) {
      const mock = MOCK_SIGNALS.find(s => s.id === signalId)
      return mock?.source || 'Beton-Discovered'
    }
    return realData?.signal?.source === 'manual' ? 'User-Defined' : 'Beton-Discovered'
  }, [isDemo, signalId, realData])

  // Retention data lookup
  const retentionData = useMemo((): { signal: number[]; nosignal: number[] } | null => {
    if (!analytics?.retention) return null
    const match = analytics.retention.find(r => {
      if (r.tab !== retTab) return false
      if (retTab === 'users') return true // Users tab ignores stat_mode
      return r.stat_mode === retStat
    })
    if (!match) return null
    return { signal: match.signal_values, nosignal: match.nosignal_values }
  }, [analytics, retTab, retStat])

  const handleDelete = async () => {
    if (!confirm(`Delete signal "${signalName}"?`)) return
    try {
      await deleteMutation.mutateAsync(signalId)
      router.push('/signals')
    } catch { /* React Query handles errors */ }
  }

  // ── Loading/Error states ────────────────────────────────

  if (!isDemo && isLoading) {
    return (
      <div className="space-y-6">
        <BackLink />
        <Card>
          <CardContent className="py-12 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-muted-foreground">Loading signal...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!isDemo && isError) {
    return (
      <div className="space-y-6">
        <BackLink />
        <Card>
          <CardContent className="py-12 text-center">
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

  if (isDemo && !MOCK_SIGNALS.find(s => s.id === signalId)) {
    return (
      <div className="space-y-6">
        <BackLink />
        <Card>
          <CardContent className="py-12 text-center">
            <h3 className="text-lg font-medium mb-2">Signal not found</h3>
            <Link href="/signals">
              <Button variant="outline">Back to Signals</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Derived data for charts ─────────────────────────────

  const snapshots = analytics?.snapshots ?? []
  const kpi = analytics?.kpi ?? {
    users_with_signal: 0,
    converted_users: 0,
    additional_net_revenue: 0,
    statistical_significance: null,
    p_value: null,
    conversion_rate: null,
  }
  const curve = analytics?.conversion_curve
  const monthLabels = snapshots.map(s =>
    new Date(s.month + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })
  )

  const windowLabel = convWindow === null ? 'No limit' : `${convWindow}d`

  return (
    <div className="space-y-6">
      <BackLink />

      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{signalName}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge
              variant="default"
              className="bg-success/10 text-success border-success/20"
            >
              active
            </Badge>
            <span className="text-sm text-muted-foreground">·</span>
            <Badge
              variant="outline"
              className={cn(
                signalSource === 'Beton-Discovered'
                  ? 'border-primary/30 text-primary'
                  : 'border-muted-foreground/30 text-muted-foreground'
              )}
            >
              {signalSource === 'Beton-Discovered' ? 'Auto' : 'Custom'}
            </Badge>
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

      {/* ── Filters ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <FilterSelect
          label="Conv. window"
          value={convWindow === null ? 'none' : String(convWindow)}
          options={[
            { value: '7', label: '7 days' },
            { value: '14', label: '14 days' },
            { value: '30', label: '30 days' },
            { value: '60', label: '60 days' },
            { value: '90', label: '90 days' },
            { value: 'none', label: 'No limit' },
          ]}
          onChange={v => setConvWindow(v === 'none' ? null : parseInt(v, 10) as ConversionWindow)}
        />
        <FilterSelect
          label="Range"
          value={range}
          options={[
            { value: '3m', label: 'Last 3 months' },
            { value: '6m', label: 'Last 6 months' },
            { value: '12m', label: 'Last 12 months' },
            { value: 'all', label: 'All time' },
          ]}
          onChange={v => setRange(v as typeof range)}
        />
      </div>

      {/* ── KPI Cards ───────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Users with Signal"
          value={kpi.users_with_signal.toLocaleString()}
          sub={`within ${windowLabel} window`}
        />
        <KPICard
          label="Converted Users"
          value={kpi.converted_users.toLocaleString()}
          sub={kpi.conversion_rate !== null
            ? `${kpi.conversion_rate}% conversion rate`
            : '--'}
        />
        <KPICard
          label="Additional Net Revenue"
          value={`$${kpi.additional_net_revenue}K`}
          sub={`attributed within ${windowLabel}`}
          highlight
        />
        <SignificanceCard
          significance={kpi.statistical_significance}
          pValue={kpi.p_value}
        />
      </div>

      {/* ── Charts Grid ─────────────────────────────────── */}
      {snapshots.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Revenue Breakdown */}
          <ChartCard title="Revenue Breakdown" subtitle="Signal vs other customer revenue">
            <RevenueChart snapshots={snapshots} height={280} />
            <ChartLegend
              items={[
                { color: CHART_COLORS.signal, label: 'Signal customers' },
                { color: CHART_COLORS.revenueBase, label: 'Other customers' },
              ]}
            />
          </ChartCard>

          {/* Signal Occurrences */}
          <ChartCard title="Signal Occurrences" subtitle="Detection count over time">
            <AreaChart
              labels={monthLabels}
              data={snapshots.map(s => s.occurrences)}
              height={280}
            />
          </ChartCard>

          {/* Conversion Rate */}
          <ChartCard title="Conversion Rate" subtitle="Signal vs non-signal users">
            <DualLineChart
              labels={monthLabels}
              seriesA={snapshots.map(s => s.conversion_rate_signal ?? 0)}
              seriesB={snapshots.map(s => s.conversion_rate_nosignal ?? 0)}
              formatValue={v => `${v.toFixed(1)}%`}
              height={240}
            />
            <ChartLegend
              items={[
                { color: CHART_COLORS.signal, label: 'With signal' },
                { color: CHART_COLORS.noSignal, label: 'Without signal' },
              ]}
            />
          </ChartCard>

          {/* Average Contract Value */}
          <ChartCard title="Avg Contract Value" subtitle="ACV comparison">
            <DualLineChart
              labels={monthLabels}
              seriesA={snapshots.map(s => s.acv_signal ?? 0)}
              seriesB={snapshots.map(s => s.acv_nosignal ?? 0)}
              formatValue={v => `$${v.toFixed(1)}K`}
              height={240}
            />
            <ChartLegend
              items={[
                { color: CHART_COLORS.signal, label: 'With signal' },
                { color: CHART_COLORS.noSignal, label: 'Without signal' },
              ]}
            />
          </ChartCard>
        </div>
      )}

      {/* ── Time-to-Conversion ──────────────────────────── */}
      {curve && (
        <ChartCard
          title="Time-to-Conversion"
          subtitle="How quickly users convert after exhibiting the signal"
          actions={
            <div className="flex items-center gap-1 text-xs">
              <button
                className={cn(
                  'px-2 py-1 rounded',
                  convCurveMode === 'cumulative'
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => setConvCurveMode('cumulative')}
              >
                Cumulative
              </button>
              <button
                className={cn(
                  'px-2 py-1 rounded',
                  convCurveMode === 'period'
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => setConvCurveMode('period')}
              >
                Per Period
              </button>
            </div>
          }
        >
          <DualLineChart
            labels={Array.from({ length: 13 }, (_, i) => `P${i}`)}
            seriesA={convCurveMode === 'cumulative' ? curve.signal_cumulative : curve.signal_period}
            seriesB={convCurveMode === 'cumulative' ? curve.nosignal_cumulative : curve.nosignal_period}
            formatValue={v => `${v.toFixed(1)}%`}
            height={260}
          />
          <ChartLegend
            items={[
              { color: CHART_COLORS.signal, label: 'With signal' },
              { color: CHART_COLORS.noSignal, label: 'Without signal' },
            ]}
          />
        </ChartCard>
      )}

      {/* ── Cohort Retention ────────────────────────────── */}
      {retentionData && (
        <ChartCard
          title="Cohort Retention"
          subtitle="How signal vs non-signal cohorts retain over time"
          actions={
            <div className="flex items-center gap-3">
              {/* Tab selector */}
              <div className="flex items-center gap-1 text-xs">
                {(['users', 'events', 'revenue'] as RetentionTab[]).map(tab => (
                  <button
                    key={tab}
                    className={cn(
                      'px-2 py-1 rounded capitalize',
                      retTab === tab
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                    onClick={() => setRetTab(tab)}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              {/* Stat mode (hidden for users tab) */}
              {retTab !== 'users' && (
                <div className="flex items-center gap-1 text-xs border-l border-border pl-3">
                  {(['total', 'avg', 'median'] as RetentionStat[]).map(stat => (
                    <button
                      key={stat}
                      className={cn(
                        'px-2 py-1 rounded capitalize',
                        retStat === stat
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                      onClick={() => setRetStat(stat)}
                    >
                      {stat}
                    </button>
                  ))}
                </div>
              )}
            </div>
          }
        >
          {/* Heatmap table */}
          <RetentionTable
            signalValues={retentionData.signal}
            nosignalValues={retentionData.nosignal}
          />

          {/* Retention line chart */}
          <div className="mt-4">
            <DualLineChart
              labels={Array.from({ length: retentionData.signal.length }, (_, i) => `M${i}`)}
              seriesA={retentionData.signal}
              seriesB={retentionData.nosignal}
              labelA="With signal"
              labelB="Without signal"
              formatValue={v => `${v.toFixed(0)}%`}
              height={220}
            />
          </div>
          <ChartLegend
            items={[
              { color: CHART_COLORS.signal, label: 'With signal' },
              { color: CHART_COLORS.noSignal, label: 'Without signal' },
            ]}
          />
        </ChartCard>
      )}
    </div>
  )
}

// ── Helper Components ──────────────────────────────────────

function BackLink() {
  return (
    <Link
      href="/signals"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
      Back to Signals
    </Link>
  )
}

function KPICard({ label, value, sub, highlight }: {
  label: string
  value: string
  sub: string
  highlight?: boolean
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className={cn('text-2xl font-bold mt-1', highlight && 'text-[#009E73]')}>
          {value}
        </p>
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      </CardContent>
    </Card>
  )
}

function SignificanceCard({ significance, pValue }: {
  significance: number | null
  pValue: number | null
}) {
  const sig = significance ?? 0
  const pval = pValue ?? 1

  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">Statistical Significance</p>
        <p className="text-2xl font-bold mt-1">{sig.toFixed(1)}%</p>
        <p className="text-xs text-muted-foreground mt-1">p-value = {pval.toFixed(3)}</p>
        {/* Significance meter */}
        <div className="mt-2 relative h-1.5 bg-border rounded-full overflow-visible">
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${Math.min(sig, 100)}%`,
              backgroundColor: sig >= 95 ? '#009E73' : sig >= 90 ? '#E69F00' : '#888',
            }}
          />
          {/* 95% threshold marker */}
          <div
            className="absolute top-[-3px] w-0.5 h-[12px] bg-muted-foreground"
            style={{ left: '95%' }}
          />
          <span
            className="absolute text-[9px] text-muted-foreground"
            style={{ left: '95%', top: '14px', transform: 'translateX(-50%)' }}
          >
            95%
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function ChartCard({ title, subtitle, children, actions }: {
  title: string
  subtitle?: string
  children: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <Card>
      <div className="px-6 pt-5 pb-3 flex items-start justify-between">
        <div>
          <h3 className="font-medium">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {actions}
      </div>
      <CardContent className="pt-0 pb-4">
        {children}
      </CardContent>
    </Card>
  )
}

function ChartLegend({ items }: {
  items: Array<{ color: string; label: string }>
}) {
  return (
    <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border">
      {items.map(item => (
        <div key={item.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
          {item.label}
        </div>
      ))}
    </div>
  )
}

function FilterSelect({ label, value, options, onChange }: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="text-xs bg-muted border border-border rounded px-2 py-1 text-foreground"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}
