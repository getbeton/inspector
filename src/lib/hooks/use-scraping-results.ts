'use client'

import { useQuery } from '@tanstack/react-query'
import {
  getScrapingResults,
  getScrapingResultDetail,
  type ScrapingResultsFilters,
} from '@/lib/api/scraping-results'
import {
  MOCK_SCRAPING_RESULTS,
  MOCK_SCRAPING_DETAIL,
} from '@/lib/data/mock-scraping-results'

const DEMO_WORKSPACE = '__demo__'

/**
 * Paginated list of scraping results (metadata only, no content).
 *
 * - Demo mode: returns MOCK_SCRAPING_RESULTS with Infinity staleTime
 * - Real mode: cursor-based pagination, 30s staleTime, auto-refetch on window focus
 */
export function useScrapingResults(
  workspaceId: string | undefined,
  filters: ScrapingResultsFilters = {}
) {
  const isDemo = !workspaceId || workspaceId === DEMO_WORKSPACE

  return useQuery({
    queryKey: [
      'scraping-results',
      'list',
      workspaceId ?? DEMO_WORKSPACE,
      filters.cursor ?? '',
      filters.operation ?? '',
      filters.sessionId ?? '',
    ],
    queryFn: () => {
      if (isDemo) {
        return Promise.resolve({
          results: MOCK_SCRAPING_RESULTS,
          next_cursor: null,
          total_count: MOCK_SCRAPING_RESULTS.length,
        })
      }
      return getScrapingResults(workspaceId!, filters)
    },
    staleTime: isDemo ? Infinity : 30_000,
    refetchOnWindowFocus: !isDemo,
  })
}

/**
 * Detail view for a single scraping result — includes full content JSONB.
 *
 * Lazy-loaded: only fires when `id` is truthy (triggered by row expansion).
 * Content is immutable after creation, so staleTime is 5 minutes.
 */
export function useScrapingResultDetail(
  workspaceId: string | undefined,
  id: string | undefined
) {
  const isDemo = !workspaceId || workspaceId === DEMO_WORKSPACE

  return useQuery({
    queryKey: ['scraping-results', 'detail', workspaceId ?? DEMO_WORKSPACE, id],
    queryFn: () => {
      if (isDemo && id) {
        return Promise.resolve(MOCK_SCRAPING_DETAIL[id] ?? null)
      }
      return getScrapingResultDetail(workspaceId!, id!)
    },
    enabled: !!id,
    staleTime: isDemo ? Infinity : 5 * 60_000,
  })
}
