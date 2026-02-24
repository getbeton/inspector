'use client'

import { Input } from '@/components/ui/input'

export type QueryStatus = 'all' | 'pending' | 'running' | 'completed' | 'failed' | 'timeout'

export interface QueryFilters {
  search: string
  status: QueryStatus
}

interface QueryFiltersBarProps {
  filters: QueryFilters
  onFiltersChange: (filters: QueryFilters) => void
  totalCount?: number
}

const STATUS_OPTIONS: Array<{ value: QueryStatus; label: string }> = [
  { value: 'all', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'timeout', label: 'Timeout' },
]

export function QueryFiltersBar({ filters, onFiltersChange, totalCount }: QueryFiltersBarProps) {
  return (
    <div className="flex items-center gap-3">
      <Input
        type="search"
        placeholder="Search queries..."
        value={filters.search}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          onFiltersChange({ ...filters, search: e.target.value })
        }
        className="max-w-xs"
      />
      <select
        value={filters.status}
        onChange={(e) =>
          onFiltersChange({
            ...filters,
            status: e.target.value as QueryStatus,
          })
        }
        className="h-8.5 rounded-lg border border-input bg-background px-3 text-sm text-foreground shadow-xs/5 sm:h-7.5"
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {totalCount !== undefined && (
        <span className="text-sm text-muted-foreground">
          {totalCount} {totalCount === 1 ? 'query' : 'queries'}
        </span>
      )}
    </div>
  )
}
