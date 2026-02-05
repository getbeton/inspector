/**
 * QueryRepository
 * Data access layer for posthog_queries table
 */

import { SupabaseClient } from '@supabase/supabase-js'
import type {
  PosthogQuery,
  PosthogQueryInsert,
  PosthogQueryUpdate,
  PosthogQueryStatus,
} from '../types/posthog-query'

export class QueryRepository {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Create a new query record
   */
  async create(data: PosthogQueryInsert): Promise<PosthogQuery> {
    const { data: query, error } = await this.supabase
      .from('posthog_queries')
      .insert(data)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to create query: ${error.message}`)
    }

    return query as PosthogQuery
  }

  /**
   * Get a query by ID
   */
  async getById(id: string): Promise<PosthogQuery | null> {
    const { data: query, error } = await this.supabase
      .from('posthog_queries')
      .select()
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null // Not found
      }
      throw new Error(`Failed to get query: ${error.message}`)
    }

    return query as PosthogQuery
  }

  /**
   * Update a query record
   */
  async update(id: string, data: PosthogQueryUpdate): Promise<PosthogQuery> {
    const { data: query, error } = await this.supabase
      .from('posthog_queries')
      .update(data)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to update query: ${error.message}`)
    }

    return query as PosthogQuery
  }

  /**
   * Update query status with timing info
   */
  async updateStatus(
    id: string,
    status: PosthogQueryStatus,
    options?: {
      execution_time_ms?: number
      error_message?: string
    }
  ): Promise<PosthogQuery> {
    const updateData: PosthogQueryUpdate = {
      status,
      ...options,
    }

    if (status === 'running') {
      updateData.started_at = new Date().toISOString()
    }

    if (status === 'completed' || status === 'failed' || status === 'timeout') {
      updateData.completed_at = new Date().toISOString()
    }

    return this.update(id, updateData)
  }

  /**
   * Count queries in the last hour for rate limiting
   * Uses the optimized idx_posthog_queries_rate_limit index
   */
  async countQueriesInLastHour(workspaceId: string): Promise<number> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    const { count, error } = await this.supabase
      .from('posthog_queries')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .gte('created_at', oneHourAgo)

    if (error) {
      throw new Error(`Failed to count queries: ${error.message}`)
    }

    return count ?? 0
  }

  /**
   * Get recent queries for a workspace
   */
  async getRecentQueries(
    workspaceId: string,
    limit: number = 10
  ): Promise<PosthogQuery[]> {
    const { data: queries, error } = await this.supabase
      .from('posthog_queries')
      .select()
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      throw new Error(`Failed to get recent queries: ${error.message}`)
    }

    return queries as PosthogQuery[]
  }
}
