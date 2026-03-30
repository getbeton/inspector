/**
 * Data Sources API Client
 *
 * Fetch-based client for the /api/data-sources endpoints.
 */

import type {
  CreateDataSourceRequest,
  UpdateDataSourceRequest,
} from '@/lib/integrations/postgres/types'

const BASE = '/api/data-sources'

async function handleResponse<T>(res: Response): Promise<T> {
  const body = await res.json()
  if (!res.ok) {
    throw new Error(body.error ?? `Request failed: ${res.status}`)
  }
  return body as T
}

export async function listDataSources() {
  const res = await fetch(BASE)
  return handleResponse<{ data_sources: Record<string, unknown>[] }>(res)
}

export async function getDataSource(id: string) {
  const res = await fetch(`${BASE}/${id}`)
  return handleResponse<{ data_source: Record<string, unknown> }>(res)
}

export async function createDataSource(config: CreateDataSourceRequest) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  return handleResponse<{ data_source: Record<string, unknown> }>(res)
}

export async function updateDataSource(
  id: string,
  patch: UpdateDataSourceRequest,
) {
  const res = await fetch(`${BASE}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  return handleResponse<{ data_source: Record<string, unknown> }>(res)
}

export async function deleteDataSource(id: string) {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' })
  return handleResponse<{ deleted: boolean }>(res)
}

export async function validateDataSource(id: string) {
  const res = await fetch(`${BASE}/${id}/validate`, { method: 'POST' })
  return handleResponse<{ status: string; message: string }>(res)
}
