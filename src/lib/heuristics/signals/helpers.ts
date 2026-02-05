/**
 * Helper functions for signal detection
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = import('@supabase/supabase-js').SupabaseClient<any, any, any>
import type { AccountData, UserData, DetectedSignal, DetectorContext } from './types'

/**
 * Check if a signal of this type already exists for the account within the lookback period
 */
export async function signalExists(
  supabase: AnySupabaseClient,
  accountId: string,
  signalType: string,
  lookbackDays: number = 1
): Promise<boolean> {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - lookbackDays)

  const { data } = await supabase
    .from('signals')
    .select('id')
    .eq('account_id', accountId)
    .eq('type', signalType)
    .gte('timestamp', cutoffDate.toISOString())
    .limit(1)

  return (data?.length ?? 0) > 0
}

/**
 * Get account data by ID
 */
export async function getAccount(
  supabase: AnySupabaseClient,
  accountId: string
): Promise<AccountData | null> {
  const { data } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', accountId)
    .single()

  return data as AccountData | null
}

/**
 * Get users for an account
 */
export async function getAccountUsers(
  supabase: AnySupabaseClient,
  accountId: string
): Promise<UserData[]> {
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: true })

  return (data as UserData[]) ?? []
}

/**
 * Count signals of a specific type for an account within a time window
 */
export async function countSignals(
  supabase: AnySupabaseClient,
  accountId: string,
  options: {
    type?: string
    startDate?: Date
    endDate?: Date
  } = {}
): Promise<number> {
  let query = supabase
    .from('signals')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)

  if (options.type) {
    query = query.eq('type', options.type)
  }
  if (options.startDate) {
    query = query.gte('timestamp', options.startDate.toISOString())
  }
  if (options.endDate) {
    query = query.lt('timestamp', options.endDate.toISOString())
  }

  const { count } = await query
  return count ?? 0
}

/**
 * Get the most recent signal of a specific type
 */
export async function getLatestSignal(
  supabase: AnySupabaseClient,
  accountId: string,
  signalType: string,
  options: {
    minValue?: number
    maxValue?: number
    startDate?: Date
  } = {}
): Promise<{ value: number; timestamp: string; details: Record<string, unknown> } | null> {
  let query = supabase
    .from('signals')
    .select('value, timestamp, details')
    .eq('account_id', accountId)
    .eq('type', signalType)
    .order('timestamp', { ascending: false })
    .limit(1)

  if (options.minValue !== undefined) {
    query = query.gte('value', options.minValue)
  }
  if (options.maxValue !== undefined) {
    query = query.lte('value', options.maxValue)
  }
  if (options.startDate) {
    query = query.gte('timestamp', options.startDate.toISOString())
  }

  const { data } = await query
  return data?.[0] ?? null
}

/**
 * Create a detected signal object
 */
export function createDetectedSignal(
  accountId: string,
  workspaceId: string,
  type: string,
  value: number | null,
  details: Record<string, unknown>
): DetectedSignal {
  return {
    account_id: accountId,
    workspace_id: workspaceId,
    type,
    value,
    details,
    source: 'heuristics',
  }
}

/**
 * Calculate percentage change between two values
 */
export function calculatePercentageChange(oldValue: number, newValue: number): number {
  if (oldValue === 0) {
    return newValue > 0 ? 1.0 : 0.0
  }
  return (newValue - oldValue) / oldValue
}

/**
 * Check if a title indicates director level or above
 */
export function isDirectorLevel(title: string | null | undefined): boolean {
  if (!title) return false

  const directorPatterns = [
    'director',
    'vp',
    'vice president',
    'head of',
    'chief',
    'c-level',
    'cto',
    'ceo',
    'cfo',
    'coo',
    'cmo',
    'svp',
    'senior vice president',
    'evp',
    'executive vp',
  ]

  const titleLower = title.toLowerCase()
  return directorPatterns.some((pattern) => titleLower.includes(pattern))
}

/**
 * Get date N days ago
 */
export function daysAgo(days: number): Date {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date
}

/**
 * Calculate days between two dates
 */
export function daysBetween(date1: Date | string, date2: Date | string = new Date()): number {
  const d1 = typeof date1 === 'string' ? new Date(date1) : date1
  const d2 = typeof date2 === 'string' ? new Date(date2) : date2
  return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))
}
