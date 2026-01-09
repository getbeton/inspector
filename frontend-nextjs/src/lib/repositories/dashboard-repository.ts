/**
 * DashboardRepository
 * Data access layer for posthog_dashboards table
 */

import { SupabaseClient } from '@supabase/supabase-js'
import type {
  PosthogDashboard,
  PosthogDashboardInsert,
  PosthogDashboardUpdate,
} from '../types/posthog-query'

export class DashboardRepository {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Create a new dashboard
   */
  async create(data: PosthogDashboardInsert): Promise<PosthogDashboard> {
    const { data: dashboard, error } = await this.supabase
      .from('posthog_dashboards')
      .insert(data)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to create dashboard: ${error.message}`)
    }

    return dashboard as PosthogDashboard
  }

  /**
   * Get a dashboard by ID
   */
  async getById(id: string): Promise<PosthogDashboard | null> {
    const { data: dashboard, error } = await this.supabase
      .from('posthog_dashboards')
      .select()
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null // Not found
      }
      throw new Error(`Failed to get dashboard: ${error.message}`)
    }

    return dashboard as PosthogDashboard
  }

  /**
   * Get all dashboards for a workspace
   */
  async getAll(
    workspaceId: string,
    options?: { activeOnly?: boolean }
  ): Promise<PosthogDashboard[]> {
    let query = this.supabase
      .from('posthog_dashboards')
      .select()
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })

    if (options?.activeOnly) {
      query = query.eq('is_active', true)
    }

    const { data: dashboards, error } = await query

    if (error) {
      throw new Error(`Failed to get dashboards: ${error.message}`)
    }

    return dashboards as PosthogDashboard[]
  }

  /**
   * Update a dashboard
   */
  async update(id: string, data: PosthogDashboardUpdate): Promise<PosthogDashboard> {
    const { data: dashboard, error } = await this.supabase
      .from('posthog_dashboards')
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to update dashboard: ${error.message}`)
    }

    return dashboard as PosthogDashboard
  }

  /**
   * Delete a dashboard
   */
  async delete(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('posthog_dashboards')
      .delete()
      .eq('id', id)

    if (error) {
      throw new Error(`Failed to delete dashboard: ${error.message}`)
    }
  }

  /**
   * Get dashboard by PostHog ID
   */
  async getByPosthogId(posthogDashboardId: string): Promise<PosthogDashboard | null> {
    const { data: dashboard, error } = await this.supabase
      .from('posthog_dashboards')
      .select()
      .eq('posthog_dashboard_id', posthogDashboardId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null // Not found
      }
      throw new Error(`Failed to get dashboard by PostHog ID: ${error.message}`)
    }

    return dashboard as PosthogDashboard
  }

  /**
   * Soft delete (deactivate) a dashboard
   */
  async deactivate(id: string): Promise<PosthogDashboard> {
    return this.update(id, { is_active: false })
  }

  /**
   * Reactivate a dashboard
   */
  async activate(id: string): Promise<PosthogDashboard> {
    return this.update(id, { is_active: true })
  }

  /**
   * Check if a dashboard with the same name exists
   */
  async existsByName(workspaceId: string, name: string): Promise<boolean> {
    const { count, error } = await this.supabase
      .from('posthog_dashboards')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('name', name)

    if (error) {
      throw new Error(`Failed to check dashboard existence: ${error.message}`)
    }

    return (count ?? 0) > 0
  }

  /**
   * Update dashboard configuration
   */
  async updateConfig(
    id: string,
    config: Record<string, unknown>
  ): Promise<PosthogDashboard> {
    return this.update(id, { config })
  }
}
