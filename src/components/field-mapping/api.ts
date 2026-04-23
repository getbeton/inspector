import type {
  Destination,
  MappingRow,
  ObjectId,
  ObjectSchema,
  SampleSubject,
  SendTestResult,
} from '@/lib/field-mapping'

export interface FieldMappingsPayload {
  objects: ObjectSchema[]
  mappings: Record<ObjectId, MappingRow[]>
}

export async function fetchFieldMappings(destination: Destination): Promise<FieldMappingsPayload> {
  const res = await fetch(`/api/integrations/${destination}/field-mappings`, { cache: 'no-store' })
  if (!res.ok) {
    const body = await safeJson(res)
    throw new Error(errorText(body) || `Failed to load field mappings (${res.status})`)
  }
  const data = await res.json()
  // Ensure all object ids are present as empty arrays for simpler UI logic
  const mappings: Record<ObjectId, MappingRow[]> = {
    deals: [],
    people: [],
    companies: [],
    workspaces: [],
    ...(data.mappings ?? {}),
  }
  return { objects: data.objects ?? [], mappings }
}

export async function saveFieldMappings(
  destination: Destination,
  mappings: Record<ObjectId, MappingRow[]>,
): Promise<void> {
  const res = await fetch(`/api/integrations/${destination}/field-mappings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mappings }),
  })
  if (!res.ok) {
    const body = await safeJson(res)
    throw new Error(errorText(body) || `Failed to save field mappings (${res.status})`)
  }
}

export async function fetchSampleSubjects(
  destination: Destination,
  objectId: ObjectId,
  limit = 10,
): Promise<SampleSubject[]> {
  const params = new URLSearchParams({ objectId, limit: String(limit) })
  const res = await fetch(`/api/integrations/${destination}/sample-subjects?${params}`)
  if (!res.ok) return []
  const data = await res.json()
  return data.subjects ?? []
}

export async function sendTest(
  destination: Destination,
  objectId: ObjectId,
  rows: MappingRow[],
  subjectId?: string,
): Promise<SendTestResult & { payload?: Record<string, unknown> | null; subject?: SampleSubject }> {
  const res = await fetch(`/api/integrations/${destination}/send-test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ objectId, rows, subjectId }),
  })
  const data = await safeJson(res)
  if (!res.ok) {
    return {
      status: 'error',
      code: res.status,
      title: 'Send failed',
      detail: errorText(data) || `HTTP ${res.status}`,
    }
  }
  return (data ?? { status: 'error', code: 500, title: 'Empty response', detail: '' }) as unknown as SendTestResult
}

async function safeJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

function errorText(body: Record<string, unknown> | null): string | null {
  if (!body) return null
  const err = body.error
  return typeof err === 'string' ? err : null
}
