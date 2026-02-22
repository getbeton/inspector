'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { useScrapingResultDetail } from '@/lib/hooks/use-scraping-results'
import type { ScrapingResultListItem } from '@/lib/api/scraping-results'

// ============================================
// Types
// ============================================

export type SortColumn = 'scraped' | 'size'
export type SortDirection = 'asc' | 'desc'

interface ScrapingResultsTableProps {
  results: ScrapingResultListItem[]
  workspaceId: string | undefined
  sortBy?: SortColumn
  sortDir?: SortDirection
  onSortChange?: (column: SortColumn) => void
}

// ============================================
// Helpers
// ============================================

const OPERATION_VARIANT: Record<string, 'secondary' | 'info' | 'default'> = {
  scrape: 'secondary',
  crawl: 'info',
  extract: 'default',
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60_000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`

  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return `${diffDays}d ago`

  return date.toLocaleDateString()
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  return `${mb.toFixed(1)} MB`
}

function truncateSessionId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id
}

// ============================================
// Sort indicator
// ============================================

function SortIndicator({
  column,
  sortBy,
  sortDir,
}: {
  column: SortColumn
  sortBy?: SortColumn
  sortDir?: SortDirection
}) {
  if (sortBy !== column) {
    return <span className="ml-1 text-muted-foreground/40">↕</span>
  }
  return <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
}

// ============================================
// Expanded row — content preview
// ============================================

function ContentPreview({
  id,
  workspaceId,
}: {
  id: string
  workspaceId: string | undefined
}) {
  const { data: detail, isLoading } = useScrapingResultDetail(workspaceId, id)

  if (isLoading) {
    return (
      <div className="px-4 py-6 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Loading content...
        </div>
      </div>
    )
  }

  if (!detail?.content) {
    return (
      <div className="px-4 py-6 text-sm text-muted-foreground">
        No content available
      </div>
    )
  }

  const { markdown, links, metadata, truncated } = detail.content
  const title = metadata?.title as string | undefined
  const sourceURL = metadata?.sourceURL as string | undefined
  const statusCode = metadata?.statusCode as number | undefined

  return (
    <div className="px-4 py-4 space-y-3 bg-muted/20">
      {/* Metadata bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {title && <span className="font-medium text-foreground">{title}</span>}
        {sourceURL && (
          <a
            href={sourceURL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground underline underline-offset-2 truncate max-w-[300px]"
          >
            {sourceURL}
          </a>
        )}
        {statusCode && <span>HTTP {statusCode}</span>}
        {links && links.length > 0 && <span>{links.length} links found</span>}
      </div>

      {/* Truncation notice */}
      {truncated && (
        <div className="text-xs text-warning-foreground bg-warning/10 px-2 py-1 rounded">
          Content was truncated to 500 KB
        </div>
      )}

      {/* Markdown preview */}
      {markdown && (
        <div className="max-h-[300px] overflow-y-auto rounded border bg-background p-3">
          <pre className="text-sm whitespace-pre-wrap break-words font-mono leading-relaxed">
            {markdown}
          </pre>
        </div>
      )}
    </div>
  )
}

// ============================================
// Main table component
// ============================================

export function ScrapingResultsTable({
  results,
  workspaceId,
  sortBy,
  sortDir,
  onSortChange,
}: ScrapingResultsTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (results.length === 0) {
    return null
  }

  const sortableColumns: { id: SortColumn; label: string }[] = [
    { id: 'scraped', label: 'Scraped' },
    { id: 'size', label: 'Size' },
  ]

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-muted/50 text-left text-sm text-muted-foreground">
            <th className="px-4 py-3 font-medium">URL</th>
            <th className="px-4 py-3 font-medium">Operation</th>
            <th className="px-4 py-3 font-medium">Session</th>
            {sortableColumns.map((col) => (
              <th key={col.id} className="px-4 py-3 font-medium">
                {onSortChange ? (
                  <button
                    onClick={() => onSortChange(col.id)}
                    className="inline-flex items-center hover:text-foreground transition-colors"
                  >
                    {col.label}
                    <SortIndicator column={col.id} sortBy={sortBy} sortDir={sortDir} />
                  </button>
                ) : (
                  col.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {results.map((row) => {
            const isExpanded = expandedId === row.id
            return (
              <ExpandableRow
                key={row.id}
                row={row}
                isExpanded={isExpanded}
                onToggle={() => setExpandedId(isExpanded ? null : row.id)}
                workspaceId={workspaceId}
              />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ============================================
// Expandable row
// ============================================

function ExpandableRow({
  row,
  isExpanded,
  onToggle,
  workspaceId,
}: {
  row: ScrapingResultListItem
  isExpanded: boolean
  onToggle: () => void
  workspaceId: string | undefined
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="border-t hover:bg-muted/30 cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggle()
          }
        }}
        aria-expanded={isExpanded}
      >
        <td className="px-4 py-3 min-w-0 max-w-[300px]">
          <span className="block truncate text-sm" title={row.url}>
            {row.url}
          </span>
        </td>
        <td className="px-4 py-3">
          <Badge variant={OPERATION_VARIANT[row.operation] || 'secondary'} size="sm">
            {row.operation}
          </Badge>
        </td>
        <td className="px-4 py-3">
          <span className="font-mono text-sm text-muted-foreground" title={row.session_id}>
            {truncateSessionId(row.session_id)}
          </span>
        </td>
        <td className="px-4 py-3 text-sm text-muted-foreground">
          {formatRelativeTime(row.created_at)}
        </td>
        <td className="px-4 py-3 text-sm text-muted-foreground" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {formatBytes(row.content_size_bytes)}
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={5} className="p-0">
            <ContentPreview id={row.id} workspaceId={workspaceId} />
          </td>
        </tr>
      )}
    </>
  )
}
