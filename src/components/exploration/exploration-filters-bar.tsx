'use client'

import { Input } from '@/components/ui/input'
import type { AgentSessionStatus } from '@/lib/agent/session'

export interface ExplorationFilters {
  search: string
  status: AgentSessionStatus | 'all'
}

interface ExplorationFiltersBarProps {
  filters: ExplorationFilters
  onFiltersChange: (filters: ExplorationFilters) => void
}

const STATUS_OPTIONS: Array<{ value: ExplorationFilters['status']; label: string }> = [
  { value: 'all', label: 'All Statuses' },
  { value: 'created', label: 'Created' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'closed', label: 'Closed' },
]

export function ExplorationFiltersBar({ filters, onFiltersChange }: ExplorationFiltersBarProps) {
  return (
    <div className="flex items-center gap-3">
      <Input
        type="search"
        placeholder="Search sessions..."
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
            status: e.target.value as ExplorationFilters['status'],
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
    </div>
  )
}
