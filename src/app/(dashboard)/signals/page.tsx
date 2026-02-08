'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SignalFiltersBar, type SignalFilters } from '@/components/signals/signal-filters'
import { SignalsTable } from '@/components/signals/signals-table'
import { BulkActions } from '@/components/signals/bulk-actions'
import { DemoBanner } from '@/components/home/DemoBanner'
import { useSetupStatus } from '@/lib/hooks/use-setup-status'
import { useDemoMode } from '@/lib/hooks/use-demo-mode'
import { MOCK_SIGNALS, type SignalData } from '@/lib/data/mock-signals'

export default function SignalsPage() {
  const { data: setupStatus } = useSetupStatus()
  const { isDemoMode } = useDemoMode()
  const isDemo = !setupStatus || !setupStatus.setupComplete

  // Show mock data when setup incomplete, empty when complete (real API TBD)
  const signals: SignalData[] = isDemo ? MOCK_SIGNALS : []
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const [filters, setFilters] = useState<SignalFilters>({
    search: '',
    status: 'all',
    source: 'all',
    minLift: 0,
    minConfidence: 0
  })

  // Filter signals based on current filters
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

      // Source filter
      if (filters.source !== 'all' && signal.source !== filters.source) {
        return false
      }

      // Min lift filter
      if (signal.lift < filters.minLift) {
        return false
      }

      // Min confidence filter
      if (signal.confidence < filters.minConfidence) {
        return false
      }

      return true
    })
  }, [signals, filters])

  // Stats summary
  const stats = useMemo(() => {
    const active = signals.filter(s => s.status === 'active').length
    const avgLift = signals.length > 0
      ? signals.reduce((sum, s) => sum + s.lift, 0) / signals.length
      : 0
    const totalArr = signals.reduce((sum, s) => sum + s.estimated_arr, 0)
    const totalLeads = signals.reduce((sum, s) => sum + s.leads_per_month, 0)

    return { active, avgLift, totalArr, totalLeads }
  }, [signals])

  // Bulk actions handlers
  const handleActivate = () => {
    console.log('Activating signals:', selectedIds)
    // TODO: Call API to activate signals
    setSelectedIds([])
  }

  const handleDeactivate = () => {
    console.log('Deactivating signals:', selectedIds)
    // TODO: Call API to deactivate signals
    setSelectedIds([])
  }

  const handleDelete = () => {
    if (confirm(`Delete ${selectedIds.length} signal(s)?`)) {
      console.log('Deleting signals:', selectedIds)
      // TODO: Call API to delete signals
      setSelectedIds([])
    }
  }

  const handleExport = () => {
    console.log('Exporting signals:', selectedIds)
    // TODO: Implement CSV export
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

      {/* Signals Table */}
      {filteredSignals.length > 0 ? (
        <SignalsTable
          signals={filteredSignals}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
        />
      ) : (
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
