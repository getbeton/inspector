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
