/**
 * Data Source Credential Helpers
 *
 * CRUD operations on the `data_sources` table, with password masking
 * for public-facing responses and admin variants for agent routes.
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { DataSourceRecord, DataSourcePublic } from './types'

// ── Password Masking ──────────────────────────────────────

function maskPassword(encrypted: string): string {
  // Show just enough to identify which credential, never the actual value
  if (encrypted.length <= 12) return '********'
  return encrypted.slice(0, 4) + '****' + encrypted.slice(-4)
}

function toPublic(record: DataSourceRecord): DataSourcePublic {
  const { password_encrypted, ...rest } = record
  return {
    ...rest,
    password_masked: maskPassword(password_encrypted),
  }
}

// ── User-facing (RLS-protected) ───────────────────────────

/**
 * List all data sources for the current user's workspace.
 * Passwords are masked — never exposed to the frontend.
 */
export async function listDataSources(
  workspaceId: string,
): Promise<DataSourcePublic[]> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('data_sources')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`Failed to list data sources: ${error.message}`)
  return (data as unknown as DataSourceRecord[]).map(toPublic)
}

/**
 * Get a single data source by ID (RLS-protected, password masked).
 */
export async function getDataSource(
  workspaceId: string,
  dataSourceId: string,
): Promise<DataSourcePublic | null> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('data_sources')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', dataSourceId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // not found
    throw new Error(`Failed to get data source: ${error.message}`)
  }
  return toPublic(data as unknown as DataSourceRecord)
}

// ── Admin (bypass RLS — for agent routes) ─────────────────

/**
 * Get a data source record by ID, bypassing RLS.
 * Returns the full record including encrypted password for decryption.
 * Used by agent routes where auth is via x-agent-secret, not user session.
 */
export async function getDataSourceAdmin(
  workspaceId: string,
  dataSourceId: string,
): Promise<DataSourceRecord | null> {
  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('data_sources')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', dataSourceId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`Failed to get data source: ${error.message}`)
  }
  return data as unknown as DataSourceRecord
}

/**
 * Get a data source by name within a workspace (admin, bypass RLS).
 */
export async function getDataSourceByNameAdmin(
  workspaceId: string,
  name: string,
): Promise<DataSourceRecord | null> {
  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('data_sources')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('name', name)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`Failed to get data source by name: ${error.message}`)
  }
  return data as unknown as DataSourceRecord
}

/**
 * List all data sources for a workspace (admin, bypass RLS).
 * Returns full records including encrypted passwords.
 */
export async function listDataSourcesAdmin(
  workspaceId: string,
): Promise<DataSourceRecord[]> {
  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('data_sources')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`Failed to list data sources: ${error.message}`)
  return data as unknown as DataSourceRecord[]
}

/**
 * Check if any Postgres data source is connected for a workspace.
 * Used by the integration definitions API to enrich is_connected.
 */
export async function hasConnectedPostgresSource(
  workspaceId: string,
): Promise<boolean> {
  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error } = await (admin as any)
    .from('data_sources')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('source_type', 'postgres')
    .eq('status', 'connected')

  if (error) return false
  return (count ?? 0) > 0
}

/**
 * Update data source status (admin, used after connection validation).
 */
export async function updateDataSourceStatus(
  dataSourceId: string,
  status: 'connected' | 'error' | 'disconnected',
  lastError?: string,
): Promise<void> {
  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from('data_sources')
    .update({
      status,
      last_validated_at: new Date().toISOString(),
      last_error: lastError ?? null,
    } as Record<string, unknown>)
    .eq('id', dataSourceId)

  if (error) throw new Error(`Failed to update data source status: ${error.message}`)
}
