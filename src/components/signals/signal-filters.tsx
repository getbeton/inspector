'use client'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils/cn'

export interface SignalFilters {
  search: string
  status: 'all' | 'active' | 'draft'
  source: 'all' | 'Beton-Discovered' | 'User-Defined'
  minLift: number
  minConfidence: number
}

interface SignalFiltersProps {
  filters: SignalFilters
  onFiltersChange: (filters: SignalFilters) => void
  className?: string
}

export function SignalFiltersBar({ filters, onFiltersChange, className }: SignalFiltersProps) {
  const updateFilter = <K extends keyof SignalFilters>(key: K, value: SignalFilters[K]) => {
    onFiltersChange({ ...filters, [key]: value })
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-3', className)}>
      {/* Search */}
      <div className="flex-1 min-w-[200px]">
        <Input
          placeholder="Search signals..."
          value={filters.search}
          onChange={(e) => updateFilter('search', e.target.value)}
          className="w-full"
        />
      </div>

      {/* Status Filter */}
      <select
        value={filters.status}
        onChange={(e) => updateFilter('status', e.target.value as SignalFilters['status'])}
        className="h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        <option value="all">All Status</option>
        <option value="active">Active</option>
        <option value="draft">Draft</option>
      </select>

      {/* Source Filter */}
      <select
        value={filters.source}
        onChange={(e) => updateFilter('source', e.target.value as SignalFilters['source'])}
        className="h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        <option value="all">All Sources</option>
        <option value="Beton-Discovered">Beton-Discovered</option>
        <option value="User-Defined">User-Defined</option>
      </select>

      {/* Min Lift Filter */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-muted-foreground whitespace-nowrap">Min Lift:</label>
        <select
          value={filters.minLift}
          onChange={(e) => updateFilter('minLift', parseFloat(e.target.value))}
          className="h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <option value="0">Any</option>
          <option value="1">1.0x+</option>
          <option value="2">2.0x+</option>
          <option value="3">3.0x+</option>
          <option value="4">4.0x+</option>
        </select>
      </div>

      {/* Min Confidence Filter */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-muted-foreground whitespace-nowrap">Confidence:</label>
        <select
          value={filters.minConfidence}
          onChange={(e) => updateFilter('minConfidence', parseFloat(e.target.value))}
          className="h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <option value="0">Any</option>
          <option value="0.9">90%+</option>
          <option value="0.95">95%+</option>
          <option value="0.99">99%+</option>
        </select>
      </div>
    </div>
  )
}
