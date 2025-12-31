'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils/cn'
import { TrendChart, GroupedBarChart } from '@/components/charts'
import { MOCK_SIGNALS } from '@/lib/data/mock-signals'

interface BacktestResult {
  date: string
  matches: number
  conversions: number
  accuracy: number
}

interface SignalPerformance {
  signalId: string
  signalName: string
  totalMatches: number
  totalConversions: number
  accuracy: number
  precision: number
  recall: number
  avgDaysToConvert: number
  trend: 'up' | 'down' | 'stable'
}

// Generate mock backtest results
const generateBacktestData = (signalId: string, days: number): BacktestResult[] => {
  const results: BacktestResult[] = []
  const baseMatches = 10 + Math.random() * 20
  const baseConversionRate = 0.1 + Math.random() * 0.3

  for (let i = days; i >= 0; i--) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    const matches = Math.round(baseMatches + (Math.random() - 0.5) * 10)
    const conversions = Math.round(matches * (baseConversionRate + (Math.random() - 0.5) * 0.1))
    results.push({
      date: date.toISOString().split('T')[0],
      matches,
      conversions,
      accuracy: conversions / matches,
    })
  }
  return results
}

const generateSignalPerformance = (): SignalPerformance[] => {
  return MOCK_SIGNALS.slice(0, 6).map(signal => ({
    signalId: signal.id,
    signalName: signal.name,
    totalMatches: Math.round(100 + Math.random() * 500),
    totalConversions: Math.round(20 + Math.random() * 100),
    accuracy: 0.15 + Math.random() * 0.35,
    precision: 0.2 + Math.random() * 0.4,
    recall: 0.3 + Math.random() * 0.3,
    avgDaysToConvert: Math.round(5 + Math.random() * 20),
    trend: ['up', 'down', 'stable'][Math.floor(Math.random() * 3)] as 'up' | 'down' | 'stable',
  }))
}

const DATE_RANGES = [
  { label: '7 days', value: 7 },
  { label: '14 days', value: 14 },
  { label: '30 days', value: 30 },
  { label: '60 days', value: 60 },
  { label: '90 days', value: 90 },
]

export default function BacktestPage() {
  const [selectedSignal, setSelectedSignal] = useState<string | 'all'>('all')
  const [dateRange, setDateRange] = useState(30)
  const [isRunning, setIsRunning] = useState(false)
  const [hasRun, setHasRun] = useState(true) // Pre-populated for demo

  const [signalPerformance] = useState<SignalPerformance[]>(generateSignalPerformance)
  const [backtestResults, setBacktestResults] = useState<BacktestResult[]>(
    generateBacktestData('all', 30)
  )

  const runBacktest = async () => {
    setIsRunning(true)
    // Simulate backtest execution
    await new Promise(resolve => setTimeout(resolve, 2000))
    setBacktestResults(generateBacktestData(selectedSignal, dateRange))
    setHasRun(true)
    setIsRunning(false)
  }

  const aggregateStats = useMemo(() => {
    if (!backtestResults.length) return null
    const totalMatches = backtestResults.reduce((sum, r) => sum + r.matches, 0)
    const totalConversions = backtestResults.reduce((sum, r) => sum + r.conversions, 0)
    return {
      totalMatches,
      totalConversions,
      overallAccuracy: totalConversions / totalMatches,
      avgMatchesPerDay: totalMatches / backtestResults.length,
      avgConversionsPerDay: totalConversions / backtestResults.length,
    }
  }, [backtestResults])

  const chartData = useMemo(() => {
    return backtestResults.map(r => ({
      name: r.date,
      value: r.matches,
      Matches: r.matches,
      Conversions: r.conversions,
    }))
  }, [backtestResults])

  const accuracyChartData = useMemo(() => {
    return backtestResults.map(r => r.accuracy)
  }, [backtestResults])

  const accuracyLabels = useMemo(() => {
    return backtestResults.map(r => r.date.slice(5)) // MM-DD format
  }, [backtestResults])

  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return <span className="text-success">+</span>
      case 'down':
        return <span className="text-destructive">-</span>
      default:
        return <span className="text-muted-foreground">=</span>
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Backtest</h1>
        <p className="text-muted-foreground">
          Validate signal effectiveness against historical conversion data
        </p>
      </div>

      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Backtest Configuration</CardTitle>
          <CardDescription>
            Select signals and time range to analyze historical performance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium mb-1.5 block">Signal</label>
              <select
                value={selectedSignal}
                onChange={(e) => setSelectedSignal(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm"
              >
                <option value="all">All Signals</option>
                {MOCK_SIGNALS.map(signal => (
                  <option key={signal.id} value={signal.id}>{signal.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Time Range</label>
              <div className="flex items-center gap-1">
                {DATE_RANGES.map(range => (
                  <button
                    key={range.value}
                    onClick={() => setDateRange(range.value)}
                    className={cn(
                      'px-3 py-2 text-sm rounded-md transition-colors',
                      dateRange === range.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            </div>
            <Button onClick={runBacktest} disabled={isRunning}>
              {isRunning ? (
                <>
                  <svg className="w-4 h-4 mr-2 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Running...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Run Backtest
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {hasRun && aggregateStats && (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Total Matches</p>
                <p className="text-3xl font-bold mt-1">{aggregateStats.totalMatches.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Conversions</p>
                <p className="text-3xl font-bold text-success mt-1">{aggregateStats.totalConversions.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Accuracy Rate</p>
                <p className="text-3xl font-bold text-primary mt-1">
                  {(aggregateStats.overallAccuracy * 100).toFixed(1)}%
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Avg. Matches/Day</p>
                <p className="text-3xl font-bold mt-1">{aggregateStats.avgMatchesPerDay.toFixed(1)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Avg. Conversions/Day</p>
                <p className="text-3xl font-bold mt-1">{aggregateStats.avgConversionsPerDay.toFixed(1)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Matches vs Conversions</CardTitle>
                <CardDescription>Daily signal matches and resulting conversions</CardDescription>
              </CardHeader>
              <CardContent>
                <GroupedBarChart
                  data={chartData}
                  series={[
                    { dataKey: 'Matches', color: 'hsl(var(--primary))', name: 'Matches' },
                    { dataKey: 'Conversions', color: 'hsl(var(--success))', name: 'Conversions' },
                  ]}
                  height={300}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Accuracy Trend</CardTitle>
                <CardDescription>Signal accuracy over time (%)</CardDescription>
              </CardHeader>
              <CardContent>
                <TrendChart
                  data={accuracyChartData}
                  labels={accuracyLabels}
                  height={300}
                  color="hsl(var(--primary))"
                />
              </CardContent>
            </Card>
          </div>

          {/* Signal Performance Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Signal Performance Breakdown</CardTitle>
              <CardDescription>
                Individual signal metrics and conversion statistics
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Signal
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Matches
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Conversions
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Accuracy
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Precision
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Recall
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Avg. Days to Convert
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Trend
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {signalPerformance.map((perf) => (
                      <tr key={perf.signalId} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-4">
                          <p className="font-medium">{perf.signalName}</p>
                        </td>
                        <td className="px-4 py-4 text-right">
                          {perf.totalMatches.toLocaleString()}
                        </td>
                        <td className="px-4 py-4 text-right text-success font-medium">
                          {perf.totalConversions.toLocaleString()}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <span className={cn(
                            'font-medium',
                            perf.accuracy >= 0.3 ? 'text-success' :
                            perf.accuracy >= 0.2 ? 'text-warning' : 'text-destructive'
                          )}>
                            {(perf.accuracy * 100).toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          {(perf.precision * 100).toFixed(1)}%
                        </td>
                        <td className="px-4 py-4 text-right">
                          {(perf.recall * 100).toFixed(1)}%
                        </td>
                        <td className="px-4 py-4 text-right">
                          {perf.avgDaysToConvert}d
                        </td>
                        <td className="px-4 py-4 text-center">
                          <Badge
                            variant="outline"
                            className={cn(
                              perf.trend === 'up' ? 'border-success/50 text-success' :
                              perf.trend === 'down' ? 'border-destructive/50 text-destructive' :
                              'border-muted-foreground/50'
                            )}
                          >
                            {getTrendIcon(perf.trend)} {perf.trend}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Insights */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Insights & Recommendations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-success/5 border border-success/20 rounded-lg">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-success">Top Performer</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        <strong>Pricing Page Intent</strong> has the highest accuracy rate at 42%,
                        indicating strong conversion correlation.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-warning/5 border border-warning/20 rounded-lg">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-warning/10 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-warning">Needs Attention</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        <strong>Trial Extension</strong> signal shows declining accuracy.
                        Consider adjusting the detection criteria.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-primary">Growth Opportunity</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Combining <strong>Usage Spike</strong> with <strong>Team Growth</strong> signals
                        could improve accuracy by ~15%.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-muted border border-border rounded-lg">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium">Benchmark</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Your overall accuracy of <strong>{(aggregateStats.overallAccuracy * 100).toFixed(1)}%</strong> is
                        above the industry average of 18% for PQL signals.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {!hasRun && (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium mb-2">Ready to Backtest</h3>
            <p className="text-muted-foreground mb-4">
              Configure your backtest parameters above and click "Run Backtest" to analyze historical signal performance.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
