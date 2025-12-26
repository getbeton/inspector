import { apiClient } from './client'

/**
 * Signal API methods
 * Communicates with FastAPI backend for signal operations
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

export interface BacktestRequest {
  signal_name: string
  conditions: any[]
  time_window?: string
  date_from?: string
  date_to?: string
}

export interface BacktestResponse {
  signal_name: string
  total_users: number
  users_with_signal: number
  converted_with_signal: number
  converted_without_signal: number
  conversion_rate_with: number
  conversion_rate_without: number
  lift: number
  precision: number
  recall: number
  f1_score: number
  estimated_arr: number
}

/**
 * Get list of all signals
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
 * Run backtest on a signal
 */
export async function runBacktest(
  request: BacktestRequest,
  useMockData = false
): Promise<{ result: BacktestResponse }> {
  return apiClient.post<{ result: BacktestResponse }>(
    '/api/signals/backtest',
    request,
    { useMockData }
  )
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
