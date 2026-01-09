/**
 * ResultRepository
 * Data access layer for posthog_query_results table (cache)
 */

import { SupabaseClient } from '@supabase/supabase-js'
import type {
  PosthogQueryResult,
  PosthogQueryResultInsert,
} from '../types/posthog-query'

export class ResultRepository {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Create a new result record (store in cache)
   */
  async create(data: PosthogQueryResultInsert): Promise<PosthogQueryResult> {
    const { data: result, error } = await this.supabase
      .from('posthog_query_results')
      .insert(data)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to create result: ${error.message}`)
    }

    return result as PosthogQueryResult
  }

  /**
   * Get result by query ID
   */
  async getByQueryId(queryId: string): Promise<PosthogQueryResult | null> {
    const { data: result, error } = await this.supabase
      .from('posthog_query_results')
      .select()
      .eq('query_id', queryId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null // Not found
      }
      throw new Error(`Failed to get result: ${error.message}`)
    }

    return result as PosthogQueryResult
  }

  /**
   * Get cached result by query hash
   * Uses the optimized idx_posthog_query_results_cache_lookup index
   * Returns the most recent non-expired cached result
   */
  async getCached(
    workspaceId: string,
    queryHash: string
  ): Promise<PosthogQueryResult | null> {
    const now = new Date().toISOString()

    const { data: result, error } = await this.supabase
      .from('posthog_query_results')
      .select()
      .eq('workspace_id', workspaceId)
      .eq('query_hash', queryHash)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('cached_at', { ascending: false })
      .limit(1)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null // Not found (cache miss)
      }
      throw new Error(`Failed to get cached result: ${error.message}`)
    }

    return result as PosthogQueryResult
  }

  /**
   * Check if a cached result exists (faster than getCached for existence check)
   */
  async isCached(workspaceId: string, queryHash: string): Promise<boolean> {
    const now = new Date().toISOString()

    const { count, error } = await this.supabase
      .from('posthog_query_results')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('query_hash', queryHash)
      .or(`expires_at.is.null,expires_at.gt.${now}`)

    if (error) {
      throw new Error(`Failed to check cache: ${error.message}`)
    }

    return (count ?? 0) > 0
  }

  /**
   * Delete expired cache entries
   * Call periodically for cleanup
   */
  async deleteExpired(workspaceId: string): Promise<number> {
    const now = new Date().toISOString()

    const { data, error } = await this.supabase
      .from('posthog_query_results')
      .delete()
      .eq('workspace_id', workspaceId)
      .lt('expires_at', now)
      .not('expires_at', 'is', null)
      .select()

    if (error) {
      throw new Error(`Failed to delete expired results: ${error.message}`)
    }

    return data?.length ?? 0
  }

  /**
   * Get cache statistics for a workspace
   */
  async getCacheStats(workspaceId: string): Promise<{
    total_cached: number
    expired: number
    total_rows_cached: number
  }> {
    const now = new Date().toISOString()

    // Total cached results
    const { count: totalCached } = await this.supabase
      .from('posthog_query_results')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)

    // Expired results
    const { count: expired } = await this.supabase
      .from('posthog_query_results')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .lt('expires_at', now)
      .not('expires_at', 'is', null)

    // Sum of row counts (approximate cache size)
    const { data: rowData } = await this.supabase
      .from('posthog_query_results')
      .select('row_count')
      .eq('workspace_id', workspaceId)

    const totalRowsCached = rowData?.reduce((sum, r) => sum + (r.row_count || 0), 0) ?? 0

    return {
      total_cached: totalCached ?? 0,
      expired: expired ?? 0,
      total_rows_cached: totalRowsCached,
    }
  }
}
