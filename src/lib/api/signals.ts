import { apiClient } from './client'

/**
 * Signal API methods
 * Communicates with Next.js API routes for signal operations
 */

export interface Signal {
  id: string
  name: string
  source: 'builtin' | 'custom'
  lift: number
  confidence: number
  leads_per_month: number
  estimated_arr: number
  status: 'enabled' | 'disabled'
  signal_type: string
  created_at: string
  updated_at: string
}

export interface SignalDetail extends Signal {
  description: string
  conversion_with: number
  conversion_without: number
  precision: number
  recall: number
  f1_score: number
  conditions: any[]
}

export interface SignalListResponse {
  signals: Signal[]
  total: number
  mock: boolean
}

/** Real signal from the database (signals table shape) */
export interface DBSignal {
  id: string
  workspace_id: string
  account_id: string
  type: string
  value: number | null
  details: Record<string, unknown>
  timestamp: string
  source: string | null
  created_at: string
  accounts?: {
    id: string
    name: string
    domain: string | null
    arr: number | null
    health_score: number | null
  } | null
}

export interface DBSignalListResponse {
  signals: DBSignal[]
  pagination: {
    page: number
    limit: number
    total: number
    pages: number
  }
}

export interface SignalFilterParams {
  source?: 'manual' | 'heuristic' | string
  type?: string
  search?: string
  page?: number
  limit?: number
}

export interface SignalMetrics {
  total_count: number
  count_7d: number
  count_30d: number
  lift: number | null
  conversion_rate: number | null
  confidence: number | null
  sample_size: number | null
  calculated_at: string | null
}

export interface RealSignalDetailResponse {
  signal: DBSignal
  metrics: SignalMetrics | null
  related_signals: Array<{
    id: string
    type: string
    value: number | null
    timestamp: string
    source: string | null
  }>
  scores: Array<{
    score_type: string
    score_value: number
    calculated_at: string
  }>
}

// ── Signal Analytics Types ──────────────────────────────────

/** Conversion window options (days) */
export type ConversionWindow = 7 | 14 | 30 | 60 | 90 | null

/** Per-customer revenue breakdown within a month */
export interface CustomerBreakdown {
  name: string
  spend: number
  speed: 1 | 2 | 3 // conversion speed: 1=fast, 2=medium, 3=slow
}

/** Monthly snapshot for a signal at a given conversion window */
export interface SignalAnalyticsSnapshot {
  id: string
  month: string // ISO date, first of month
  conversion_window_days: number | null
  users_with_signal: number
  converted_users: number
  additional_net_revenue: number
  statistical_significance: number | null
  p_value: number | null
  revenue_signal: number
  revenue_other: number
  occurrences: number
  conversion_rate_signal: number | null
  conversion_rate_nosignal: number | null
  acv_signal: number | null
  acv_nosignal: number | null
  customer_breakdown: CustomerBreakdown[]
  computed_at: string
}

/** KPI summary for a signal at a given conversion window */
export interface SignalKPI {
  users_with_signal: number
  converted_users: number
  additional_net_revenue: number
  statistical_significance: number | null
  p_value: number | null
  conversion_rate: number | null
}

/** Cohort retention data (M0-M8) */
export interface CohortRetention {
  tab: 'users' | 'events' | 'revenue'
  stat_mode: 'total' | 'avg' | 'median'
  signal_values: number[]   // M0-M8
  nosignal_values: number[] // M0-M8
}

/** Time-to-conversion curve data (P0-P12) */
export interface ConversionCurve {
  signal_period: number[]      // P0-P12, per-period %
  nosignal_period: number[]    // P0-P12, per-period %
  signal_cumulative: number[]  // P0-P12, cumulative %
  nosignal_cumulative: number[] // P0-P12, cumulative %
}

/** Full analytics response for a signal detail page */
export interface SignalAnalyticsResponse {
  signal_definition_id: string
  conversion_window_days: number | null
  kpi: SignalKPI
  snapshots: SignalAnalyticsSnapshot[]
  retention: CohortRetention[]
  conversion_curve: ConversionCurve | null
  available_windows: (number | null)[]
}

/** Filter parameters for signal analytics API */
export interface SignalAnalyticsParams {
  conversion_window?: number | null
  period?: 'week' | 'month' | 'quarter'
  plan?: string
  segment?: string
  range?: '3m' | '6m' | '12m' | 'all'
}

/** PostHog property mapping */
export interface PostHogPropertyMapping {
  id: string
  mapping_type: 'plan' | 'segment' | 'revenue'
  posthog_property: string
  property_value: string
  mapped_label: string
  mapped_value: number | null
  sort_order: number
}

/** Attio deal stage mapping */
export interface AttioDealMapping {
  id: string
  attio_pipeline_id: string
  attio_pipeline_name: string | null
  attio_stage_id: string
  attio_stage_name: string | null
  stage_type: 'won' | 'lost' | 'open'
  revenue_attribute_id: string | null
  revenue_attribute_name: string | null
}

/**
 * Get list of signals from the real API
 */
export async function getSignalsFromAPI(params?: SignalFilterParams): Promise<DBSignalListResponse> {
  const searchParams = new URLSearchParams()
  if (params?.source) searchParams.set('source', params.source)
  if (params?.type) searchParams.set('type', params.type)
  if (params?.page) searchParams.set('page', String(params.page))
  if (params?.limit) searchParams.set('limit', String(params.limit))

  const qs = searchParams.toString()
  const url = qs ? `/api/signals?${qs}` : '/api/signals'

  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) {
    throw new Error('Failed to fetch signals')
  }
  return res.json()
}

/**
 * Get a single signal by ID from the real API (with metrics)
 */
export async function getRealSignalById(id: string): Promise<RealSignalDetailResponse> {
  const res = await fetch(`/api/signals/${id}`, { credentials: 'include' })
  if (!res.ok) {
    throw new Error('Failed to fetch signal')
  }
  return res.json()
}

/**
 * Get list of all signals (legacy — supports mock mode)
 */
export async function getSignals(useMockData = false): Promise<SignalListResponse> {
  return apiClient.get<SignalListResponse>('/api/signals/list', { useMockData })
}

/**
 * Get signal by ID
 */
export async function getSignal(id: string, useMockData = false): Promise<{ signal: SignalDetail }> {
  return apiClient.get<{ signal: SignalDetail }>(`/api/signals/${id}`, { useMockData })
}

/**
 * Create a new signal
 */
export async function createSignal(
  data: { name: string; conditions: any[] },
  useMockData = false
): Promise<{ signal: Signal }> {
  return apiClient.post<{ signal: Signal }>('/api/signals', data, { useMockData })
}

/**
 * Update a signal
 */
export async function updateSignal(
  id: string,
  data: Partial<Signal>,
  useMockData = false
): Promise<{ signal: Signal }> {
  return apiClient.put<{ signal: Signal }>(`/api/signals/${id}`, data, { useMockData })
}

/**
 * Delete a signal
 */
export async function deleteSignal(id: string, useMockData = false): Promise<{ success: boolean }> {
  return apiClient.delete<{ success: boolean }>(`/api/signals/${id}`, { useMockData })
}

/**
 * Enable a signal
 */
export async function enableSignal(id: string, useMockData = false): Promise<{ signal: Signal }> {
  return apiClient.put<{ signal: Signal }>(`/api/signals/${id}/enable`, {}, { useMockData })
}

/**
 * Disable a signal
 */
export async function disableSignal(id: string, useMockData = false): Promise<{ signal: Signal }> {
  return apiClient.put<{ signal: Signal }>(`/api/signals/${id}/disable`, {}, { useMockData })
}

/**
 * Bulk update signals
 */
export async function bulkUpdateSignals(
  ids: string[],
  action: 'enable' | 'disable' | 'delete',
  useMockData = false
): Promise<{ updated: number }> {
  return apiClient.post<{ updated: number }>(
    '/api/signals/bulk',
    { ids, action },
    { useMockData }
  )
}

/**
 * Get signal analytics (time-series, KPIs, retention, conversion curves)
 */
export async function getSignalAnalytics(
  signalId: string,
  params?: SignalAnalyticsParams
): Promise<SignalAnalyticsResponse> {
  const searchParams = new URLSearchParams()
  if (params?.conversion_window !== undefined) {
    searchParams.set('window', params.conversion_window === null ? 'none' : String(params.conversion_window))
  }
  if (params?.period) searchParams.set('period', params.period)
  if (params?.plan) searchParams.set('plan', params.plan)
  if (params?.segment) searchParams.set('segment', params.segment)
  if (params?.range) searchParams.set('range', params.range)

  const qs = searchParams.toString()
  const url = qs
    ? `/api/signals/${signalId}/analytics?${qs}`
    : `/api/signals/${signalId}/analytics`

  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) {
    throw new Error('Failed to fetch signal analytics')
  }
  return res.json()
}

/**
 * Get PostHog property mappings for the current workspace
 */
export async function getPropertyMappings(
  mappingType?: 'plan' | 'segment' | 'revenue'
): Promise<{ mappings: PostHogPropertyMapping[] }> {
  const qs = mappingType ? `?type=${mappingType}` : ''
  const res = await fetch(`/api/integrations/posthog/mappings${qs}`, { credentials: 'include' })
  if (!res.ok) {
    throw new Error('Failed to fetch property mappings')
  }
  return res.json()
}

/**
 * Save PostHog property mappings
 */
export async function savePropertyMappings(
  mappings: Omit<PostHogPropertyMapping, 'id'>[]
): Promise<{ mappings: PostHogPropertyMapping[] }> {
  const res = await fetch('/api/integrations/posthog/mappings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ mappings }),
  })
  if (!res.ok) {
    throw new Error('Failed to save property mappings')
  }
  return res.json()
}

/**
 * Get Attio deal mappings for the current workspace
 */
export async function getDealMappings(): Promise<{ mappings: AttioDealMapping[] }> {
  const res = await fetch('/api/integrations/attio/deal-mappings', { credentials: 'include' })
  if (!res.ok) {
    throw new Error('Failed to fetch deal mappings')
  }
  return res.json()
}

/**
 * Save Attio deal mappings
 */
export async function saveDealMappings(
  mappings: Omit<AttioDealMapping, 'id'>[]
): Promise<{ mappings: AttioDealMapping[] }> {
  const res = await fetch('/api/integrations/attio/deal-mappings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ mappings }),
  })
  if (!res.ok) {
    throw new Error('Failed to save deal mappings')
  }
  return res.json()
}

/**
 * Export signals to CSV
 */
export async function exportSignalsCSV(useMockData = false): Promise<Blob> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/signals/export?mock_mode=${useMockData}`,
    {
      method: 'GET',
      credentials: 'include'
    }
  )

  if (!response.ok) {
    throw new Error('Failed to export signals')
  }

  return response.blob()
}
