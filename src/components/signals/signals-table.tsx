'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { MiniSparkline } from '@/components/charts'
import { cn } from '@/lib/utils/cn'
import type { SignalData } from '@/lib/data/mock-signals'

interface SignalsTableProps {
  signals: SignalData[]
  selectedIds: string[]
  onSelectionChange: (ids: string[]) => void
  className?: string
}

export function SignalsTable({ signals, selectedIds, onSelectionChange, className }: SignalsTableProps) {
  const allSelected = signals.length > 0 && selectedIds.length === signals.length
  const someSelected = selectedIds.length > 0 && selectedIds.length < signals.length

  const toggleAll = () => {
    if (allSelected) {
      onSelectionChange([])
    } else {
      onSelectionChange(signals.map(s => s.id))
    }
  }

  const toggleOne = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter(i => i !== id))
    } else {
      onSelectionChange([...selectedIds, id])
    }
  }

  const formatNumber = (n: number) => {
    return new Intl.NumberFormat().format(n)
  }

  const formatCurrency = (n: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(n)
  }

  const formatPercent = (n: number) => {
    return `${(n * 100).toFixed(1)}%`
  }

  return (
    <div className={cn('border border-border rounded-lg overflow-hidden', className)}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="w-12 px-4 py-3">
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onCheckedChange={toggleAll}
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Signal
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                With Signal
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Without
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Lift
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Est. ARR
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Source
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {signals.map((signal) => (
              <tr
                key={signal.id}
                className={cn(
                  'hover:bg-muted/30 transition-colors',
                  selectedIds.includes(signal.id) && 'bg-primary/5'
                )}
              >
                <td className="px-4 py-4">
                  <Checkbox
                    checked={selectedIds.includes(signal.id)}
                    onCheckedChange={() => toggleOne(signal.id)}
                  />
                </td>
                <td className="px-4 py-4">
                  <Link
                    href={`/signals/${signal.id}`}
                    className="font-medium text-foreground hover:text-primary transition-colors"
                  >
                    {signal.name}
                  </Link>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">
                      {formatNumber(signal.leads_per_month)} leads/mo
                    </span>
                    <span className={cn(
                      'text-xs',
                      signal.trend_30d.startsWith('+') ? 'text-success' : 'text-destructive'
                    )}>
                      {signal.trend_30d}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-4">
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
                </td>
                <td className="px-4 py-4 text-right">
                  {signal.conversion_with < 0 ? (
                    <Badge variant="secondary" className="text-xs">Pending</Badge>
                  ) : (
                    <>
                      <div className="font-medium">{formatPercent(signal.conversion_with)}</div>
                      <div className="text-xs text-muted-foreground">
                        n={formatNumber(signal.sample_with)}
                      </div>
                    </>
                  )}
                </td>
                <td className="px-4 py-4 text-right">
                  {signal.conversion_without < 0 ? (
                    <Badge variant="secondary" className="text-xs">Pending</Badge>
                  ) : (
                    <>
                      <div className="font-medium">{formatPercent(signal.conversion_without)}</div>
                      <div className="text-xs text-muted-foreground">
                        n={formatNumber(signal.sample_without)}
                      </div>
                    </>
                  )}
                </td>
                <td className="px-4 py-4 text-right">
                  {signal.lift < 0 ? (
                    <Badge variant="secondary" className="text-xs">Pending</Badge>
                  ) : (
                    <>
                      <div className="flex items-center justify-end gap-2">
                        <span className={cn(
                          'font-bold text-lg',
                          signal.lift >= 3 ? 'text-success' : signal.lift >= 2 ? 'text-warning' : 'text-foreground'
                        )}>
                          {signal.lift.toFixed(1)}x
                        </span>
                        <MiniSparkline data={signal.trend_data} width={40} height={16} />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {signal.confidence >= 0 ? `${formatPercent(signal.confidence)} conf` : 'Pending'}
                      </div>
                    </>
                  )}
                </td>
                <td className="px-4 py-4 text-right font-medium">
                  {formatCurrency(signal.estimated_arr)}
                </td>
                <td className="px-4 py-4">
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary row */}
      <div className="px-4 py-3 bg-muted/30 border-t border-border flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {signals.length} signal{signals.length !== 1 ? 's' : ''}
          {selectedIds.length > 0 && (
            <span className="ml-2 text-primary">
              ({selectedIds.length} selected)
            </span>
          )}
        </span>
        <span className="text-muted-foreground">
          Total Est. ARR: <span className="font-medium text-foreground">
            {formatCurrency(signals.reduce((sum, s) => sum + s.estimated_arr, 0))}
          </span>
        </span>
      </div>
    </div>
  )
}
