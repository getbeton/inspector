'use client'

import { useState, useMemo, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { QueryFiltersBar, type QueryFilters } from '@/components/queries/query-filters-bar'
import { QueryHistoryTable } from '@/components/queries/query-history-table'
import { QueryDetailSheet } from '@/components/queries/query-detail-sheet'
import { useSetupStatus } from '@/lib/hooks/use-setup-status'
import { useQueryHistory } from '@/lib/hooks/use-query-history'
import type { QueryHistoryItem } from '@/lib/api/query-history'

export default function QueryHistoryPage() {
  const { data: setupStatus, isLoading: setupLoading } = useSetupStatus()
  const isDemo = !setupStatus || !setupStatus.setupComplete
  const workspaceId = isDemo ? undefined : setupStatus?.workspaceId

  // Filters
  const [filters, setFilters] = useState<QueryFilters>({
    search: '',
    status: 'all',
  })

  // Cursor-based pagination: accumulate pages
  const [cursors, setCursors] = useState<string[]>([])
  const currentCursor = cursors[cursors.length - 1]

  const { data, isLoading: queriesLoading } = useQueryHistory(workspaceId, {
    status: filters.status !== 'all' ? filters.status : undefined,
    cursor: currentCursor,
  })

  // Accumulate results across pages
  const [allQueries, setAllQueries] = useState<QueryHistoryItem[]>([])

  // When data changes, update accumulated list
  const queries = useMemo(() => {
    if (!data?.queries) return allQueries
    // If no cursor (first page), replace. Otherwise append.
    if (!currentCursor) return data.queries
    // Deduplicate by id
    const existingIds = new Set(allQueries.map(q => q.id))
    const newQueries = data.queries.filter(q => !existingIds.has(q.id))
    return [...allQueries, ...newQueries]
  }, [data, currentCursor, allQueries])

  // Client-side search filter on accumulated results
  const filteredQueries = useMemo(() => {
    if (!filters.search) return queries
    const searchLower = filters.search.toLowerCase()
    return queries.filter((q) =>
      q.query_text.toLowerCase().includes(searchLower)
    )
  }, [queries, filters.search])

  const handleLoadMore = useCallback(() => {
    if (data?.next_cursor) {
      setAllQueries(queries)
      setCursors((prev) => [...prev, data.next_cursor!])
    }
  }, [data, queries])

  // Reset pagination when filters change
  const handleFiltersChange = useCallback((newFilters: QueryFilters) => {
    setFilters(newFilters)
    if (newFilters.status !== filters.status) {
      setCursors([])
      setAllQueries([])
    }
  }, [filters.status])

  // Sheet state
  const [selectedQuery, setSelectedQuery] = useState<QueryHistoryItem | null>(null)

  const handleQueryClick = useCallback((query: QueryHistoryItem) => {
    setSelectedQuery(query)
  }, [])

  const handleSheetClose = useCallback((open: boolean) => {
    if (!open) setSelectedQuery(null)
  }, [])

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
        <h1 className="text-2xl font-bold">Query History</h1>
        <p className="text-muted-foreground">
          Agent HogQL query execution logs
        </p>
      </div>

      {/* Filters */}
      <QueryFiltersBar
        filters={filters}
        onFiltersChange={handleFiltersChange}
        totalCount={data?.total_count}
      />

      {/* Content */}
      {queriesLoading && queries.length === 0 ? (
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Loading...</span>
          </div>
        </div>
      ) : filteredQueries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
              </svg>
            </div>
            <h3 className="text-lg font-medium mb-2">No queries yet</h3>
            <p className="text-muted-foreground">
              {queries.length > 0
                ? 'Try adjusting your filters to see more results.'
                : 'HogQL queries executed by the agent will appear here.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <QueryHistoryTable
            queries={filteredQueries}
            onQueryClick={handleQueryClick}
          />

          {/* Load More */}
          {data?.next_cursor && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={handleLoadMore}
                disabled={queriesLoading}
              >
                {queriesLoading ? 'Loading...' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}

      {/* Detail Sheet */}
      <QueryDetailSheet
        open={!!selectedQuery}
        onOpenChange={handleSheetClose}
        query={selectedQuery}
      />
    </div>
  )
}
