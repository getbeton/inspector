'use client'

import { useState, useMemo } from 'react'
import { useSetupStatus } from '@/lib/hooks/use-setup-status'
import { useScrapingResults } from '@/lib/hooks/use-scraping-results'
import {
  ScrapingResultsTable,
  type SortColumn,
  type SortDirection,
} from '@/components/exploration/scraping-results-table'

export default function ScrapingResultsPage() {
  const { data: setupStatus, isLoading: setupLoading } = useSetupStatus()
  const isDemo = !setupStatus || !setupStatus.setupComplete
  const workspaceId = isDemo ? undefined : setupStatus?.workspaceId

  // Sorting state
  const [sortBy, setSortBy] = useState<SortColumn>('scraped')
  const [sortDir, setSortDir] = useState<SortDirection>('desc')

  // Filters
  const [operationFilter, setOperationFilter] = useState<string>('all')

  const { data, isLoading: resultsLoading } = useScrapingResults(workspaceId, {
    operation: operationFilter !== 'all' ? operationFilter : undefined,
  })

  const results = data?.results ?? []

  // Client-side sort (since the API returns created_at DESC by default)
  const sortedResults = useMemo(() => {
    const sorted = [...results]
    sorted.sort((a, b) => {
      let cmp = 0
      if (sortBy === 'scraped') {
        cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      } else if (sortBy === 'size') {
        cmp = a.content_size_bytes - b.content_size_bytes
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [results, sortBy, sortDir])

  const handleSortChange = (column: SortColumn) => {
    if (sortBy === column) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(column)
      setSortDir('desc')
    }
  }

  if (setupLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Web Scraping Results</h1>
        <p className="text-muted-foreground">
          Pages scraped by the agent during analysis sessions
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <select
          value={operationFilter}
          onChange={e => setOperationFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="all">All operations</option>
          <option value="scrape">Scrape</option>
          <option value="crawl">Crawl</option>
          <option value="extract">Extract</option>
        </select>
        {data && (
          <span className="text-sm text-muted-foreground">
            {data.total_count} {data.total_count === 1 ? 'result' : 'results'}
          </span>
        )}
      </div>

      {/* Content */}
      {resultsLoading ? (
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Loading...</span>
          </div>
        </div>
      ) : sortedResults.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] text-center">
          <p className="text-lg font-medium text-muted-foreground">
            No web content scraped yet
          </p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            When the agent scrapes websites during analysis, results will appear here.
          </p>
        </div>
      ) : (
        <ScrapingResultsTable
          results={sortedResults}
          workspaceId={workspaceId}
          sortBy={sortBy}
          sortDir={sortDir}
          onSortChange={handleSortChange}
        />
      )}
    </div>
  )
}
