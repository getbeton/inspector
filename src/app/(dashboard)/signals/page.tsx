'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SignalFiltersBar, type SignalFilters } from '@/components/signals/signal-filters'
import { SignalsTable } from '@/components/signals/signals-table'
import { BulkActions } from '@/components/signals/bulk-actions'
import { DemoBanner } from '@/components/home/DemoBanner'
import { useSetupStatus } from '@/lib/hooks/use-setup-status'
import { useDemoMode } from '@/lib/hooks/use-demo-mode'
import { useRealSignals } from '@/lib/hooks/use-signals'
import { MOCK_SIGNALS, type SignalData } from '@/lib/data/mock-signals'
import type { DBSignal } from '@/lib/api/signals'

/**
 * Map a real DB signal to the SignalData shape used by the table.
 * Missing metrics show as "Pending" (represented by -1 sentinel values).
 */
function dbSignalToDisplay(signal: DBSignal): SignalData {
  const details = signal.details || {}
  return {
    id: signal.id,
    name: (details.name as string) || signal.type,
    status: 'active',
    lift: (details.lift as number) ?? -1,
    confidence: (details.confidence as number) ?? -1,
    leads_per_month: (details.leads_per_month as number) ?? 0,
    estimated_arr: (details.estimated_arr as number) ?? 0,
    source: signal.source === 'manual' ? 'User-Defined' : 'Beton-Discovered',
    trend_30d: (details.trend_30d as string) || '--',
    sample_with: (details.sample_with as number) ?? 0,
    sample_without: (details.sample_without as number) ?? 0,
    conversion_with: (details.conversion_with as number) ?? -1,
    conversion_without: (details.conversion_without as number) ?? -1,
    trend_data: (details.trend_data as number[]) || [0],
    accuracy_trend: (details.accuracy_trend as number[]) || [0],
  }
}

/** Map source filter value to API param */
function sourceFilterToAPI(source: string): string | undefined {
  if (source === 'User-Defined') return 'manual'
  if (source === 'Beton-Discovered') return 'heuristic'
  return undefined
}

export default function SignalsPage() {
  const { data: setupStatus } = useSetupStatus()
  const { isDemoMode } = useDemoMode()
  const isDemo = !setupStatus || !setupStatus.setupComplete

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [filters, setFilters] = useState<SignalFilters>({
    search: '',
    status: 'all',
    source: 'all',
    minLift: 0,
    minConfidence: 0
  })

  // Fetch real signals from API (only when setup is complete)
  const sourceParam = filters.source !== 'all' ? sourceFilterToAPI(filters.source) : undefined
  const { data: realData, isLoading, isError } = useRealSignals(
    isDemo ? undefined : { source: sourceParam }
  )

  // Use mock data in demo mode, real data otherwise
  const signals: SignalData[] = useMemo(() => {
    if (isDemo) return MOCK_SIGNALS
    if (!realData?.signals) return []
    return realData.signals.map(dbSignalToDisplay)
  }, [isDemo, realData])

  // Filter signals based on current filters (client-side for mock, server-side source already applied)
  const filteredSignals = useMemo(() => {
    return signals.filter(signal => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase()
        if (!signal.name.toLowerCase().includes(searchLower)) {
          return false
        }
      }

      // Status filter
      if (filters.status !== 'all' && signal.status !== filters.status) {
        return false
      }

      // Source filter (client-side for mock data)
      if (isDemo && filters.source !== 'all' && signal.source !== filters.source) {
        return false
      }

      // Min lift filter (skip pending metrics)
      if (signal.lift >= 0 && signal.lift < filters.minLift) {
        return false
      }

      // Min confidence filter (skip pending metrics)
      if (signal.confidence >= 0 && signal.confidence < filters.minConfidence) {
        return false
      }

      return true
    })
  }, [signals, filters, isDemo])

  // Stats summary
  const stats = useMemo(() => {
    const active = signals.filter(s => s.status === 'active').length
    const signalsWithLift = signals.filter(s => s.lift >= 0)
    const avgLift = signalsWithLift.length > 0
      ? signalsWithLift.reduce((sum, s) => sum + s.lift, 0) / signalsWithLift.length
      : 0
    const totalArr = signals.reduce((sum, s) => sum + s.estimated_arr, 0)
    const totalLeads = signals.reduce((sum, s) => sum + s.leads_per_month, 0)

    return { active, avgLift, totalArr, totalLeads }
  }, [signals])

  // Bulk actions handlers
  const handleActivate = () => {
    console.log('Activating signals:', selectedIds)
    setSelectedIds([])
  }

  const handleDeactivate = () => {
    console.log('Deactivating signals:', selectedIds)
    setSelectedIds([])
  }

  const handleDelete = () => {
    if (confirm(`Delete ${selectedIds.length} signal(s)?`)) {
      console.log('Deleting signals:', selectedIds)
      setSelectedIds([])
    }
  }

  const handleExport = () => {
    console.log('Exporting signals:', selectedIds)
  }

  const formatCurrency = (n: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(n)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Signals</h1>
          <p className="text-muted-foreground">
            Behavioral patterns that predict customer conversion
          </p>
        </div>
        <Link href="/signals/new">
          <Button>
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Signal
          </Button>
        </Link>
      </div>

      {/* Demo Banner */}
      {isDemoMode && <DemoBanner />}

      {/* Demo indicator */}
      {isDemo && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="secondary">Demo data</Badge>
          <span>Complete setup to see your real signals</span>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats.active}</div>
            <p className="text-sm text-muted-foreground">Active Signals</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats.avgLift.toFixed(1)}x</div>
            <p className="text-sm text-muted-foreground">Avg Lift</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats.totalLeads}</div>
            <p className="text-sm text-muted-foreground">Leads/Month</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{formatCurrency(stats.totalArr)}</div>
            <p className="text-sm text-muted-foreground">Est. ARR</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <SignalFiltersBar
        filters={filters}
        onFiltersChange={setFilters}
      />

      {/* Bulk Actions */}
      <BulkActions
        selectedCount={selectedIds.length}
        onActivate={handleActivate}
        onDeactivate={handleDeactivate}
        onDelete={handleDelete}
        onExport={handleExport}
      />

      {/* Loading state */}
      {!isDemo && isLoading && (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-muted-foreground">Loading signals...</p>
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {!isDemo && isError && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-destructive font-medium mb-2">Failed to load signals</p>
            <p className="text-muted-foreground mb-4">Please try again or check your connection.</p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Signals Table */}
      {!isLoading && !isError && filteredSignals.length > 0 ? (
        <SignalsTable
          signals={filteredSignals}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
        />
      ) : !isLoading && !isError && (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium mb-2">No signals found</h3>
            <p className="text-muted-foreground mb-4">
              {filters.search || filters.status !== 'all' || filters.source !== 'all' || filters.minLift > 0 || filters.minConfidence > 0
                ? 'Try adjusting your filters to see more results.'
                : 'Create your first signal to get started.'}
            </p>
            {filters.search || filters.status !== 'all' || filters.source !== 'all' || filters.minLift > 0 || filters.minConfidence > 0 ? (
              <Button
                variant="outline"
                onClick={() => setFilters({
                  search: '',
                  status: 'all',
                  source: 'all',
                  minLift: 0,
                  minConfidence: 0
                })}
              >
                Clear Filters
              </Button>
            ) : (
              <Link href="/signals/new">
                <Button>Add Signal</Button>
              </Link>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
