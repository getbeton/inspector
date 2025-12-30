'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'

interface BulkActionsProps {
  selectedCount: number
  onActivate: () => void
  onDeactivate: () => void
  onDelete: () => void
  onExport: () => void
  className?: string
}

export function BulkActions({
  selectedCount,
  onActivate,
  onDeactivate,
  onDelete,
  onExport,
  className
}: BulkActionsProps) {
  if (selectedCount === 0) return null

  return (
    <div className={cn(
      'flex items-center gap-3 p-3 bg-muted/50 border border-border rounded-lg',
      className
    )}>
      <span className="text-sm font-medium">
        {selectedCount} signal{selectedCount !== 1 ? 's' : ''} selected
      </span>
      <div className="flex items-center gap-2 ml-auto">
        <Button
          variant="outline"
          size="sm"
          onClick={onActivate}
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Activate
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onDeactivate}
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Deactivate
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onExport}
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={onDelete}
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Delete
        </Button>
      </div>
    </div>
  )
}
