/**
 * SavedQueryRepository
 * Data access layer for posthog_saved_queries table
 */

import { SupabaseClient } from '@supabase/supabase-js'
import type {
  PosthogSavedQuery,
  PosthogSavedQueryInsert,
  PosthogSavedQueryUpdate,
} from '../types/posthog-query'

export class SavedQueryRepository {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Create a new saved query
   */
  async create(data: PosthogSavedQueryInsert): Promise<PosthogSavedQuery> {
    const { data: savedQuery, error } = await this.supabase
      .from('posthog_saved_queries')
      .insert(data)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to create saved query: ${error.message}`)
    }

    return savedQuery as PosthogSavedQuery
  }

  /**
   * Get a saved query by ID
   */
  async getById(id: string): Promise<PosthogSavedQuery | null> {
    const { data: savedQuery, error } = await this.supabase
      .from('posthog_saved_queries')
      .select()
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null // Not found
      }
      throw new Error(`Failed to get saved query: ${error.message}`)
    }

    return savedQuery as PosthogSavedQuery
  }

  /**
   * Get all saved queries for a workspace
   */
  async getAll(
    workspaceId: string,
    options?: { activeOnly?: boolean }
  ): Promise<PosthogSavedQuery[]> {
    let query = this.supabase
      .from('posthog_saved_queries')
      .select()
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })

    if (options?.activeOnly) {
      query = query.eq('is_active', true)
    }

    const { data: savedQueries, error } = await query

    if (error) {
      throw new Error(`Failed to get saved queries: ${error.message}`)
    }

    return savedQueries as PosthogSavedQuery[]
  }

  /**
   * Update a saved query
   */
  async update(id: string, data: PosthogSavedQueryUpdate): Promise<PosthogSavedQuery> {
    const { data: savedQuery, error } = await this.supabase
      .from('posthog_saved_queries')
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to update saved query: ${error.message}`)
    }

    return savedQuery as PosthogSavedQuery
  }

  /**
   * Delete a saved query
   */
  async delete(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('posthog_saved_queries')
      .delete()
      .eq('id', id)

    if (error) {
      throw new Error(`Failed to delete saved query: ${error.message}`)
    }
  }

  /**
   * Get saved query by PostHog ID
   */
  async getByPosthogId(posthogQueryId: string): Promise<PosthogSavedQuery | null> {
    const { data: savedQuery, error } = await this.supabase
      .from('posthog_saved_queries')
      .select()
      .eq('posthog_query_id', posthogQueryId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null // Not found
      }
      throw new Error(`Failed to get saved query by PostHog ID: ${error.message}`)
    }

    return savedQuery as PosthogSavedQuery
  }

  /**
   * Soft delete (deactivate) a saved query
   */
  async deactivate(id: string): Promise<PosthogSavedQuery> {
    return this.update(id, { is_active: false })
  }

  /**
   * Reactivate a saved query
   */
  async activate(id: string): Promise<PosthogSavedQuery> {
    return this.update(id, { is_active: true })
  }

  /**
   * Check if a saved query with the same name exists
   */
  async existsByName(workspaceId: string, name: string): Promise<boolean> {
    const { count, error } = await this.supabase
      .from('posthog_saved_queries')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('name', name)

    if (error) {
      throw new Error(`Failed to check saved query existence: ${error.message}`)
    }

    return (count ?? 0) > 0
  }
}
