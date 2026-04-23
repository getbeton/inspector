import {
  discoverObjects,
  getObjectAttributes,
  upsertRecord,
  AttioAuthError,
  AttioRateLimitError,
  AttioNotFoundError,
  AttioValidationError,
  AttioError,
  type AttioAttribute,
} from '@/lib/integrations/attio/client'
import { getIntegrationCredentials } from '@/lib/integrations/credentials'
import type { DestinationAdapter } from './adapter'
import { fetchSampleSubjects } from './sample-subjects'
import type {
  FetchSampleSubjectsOptions,
  FieldSchema,
  MappingRow,
  ObjectId,
  ObjectSchema,
  SampleSubject,
  SendTestResult,
} from './types'

// Our ObjectId → Attio api_slug. `workspaces` is usually a custom Attio object;
// if the workspace hasn't set one up, we skip it from listObjects.
const OBJECT_TO_SLUG: Record<ObjectId, string> = {
  deals: 'deals',
  people: 'people',
  companies: 'companies',
  workspaces: 'workspaces',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

export function createAttioAdapter(ctx: { supabase: SupabaseClient }): DestinationAdapter {
  const { supabase } = ctx

  async function apiKeyFor(workspaceId: string): Promise<string> {
    const creds = await getIntegrationCredentials(workspaceId, 'attio')
    if (!creds) {
      throw new AttioError('Attio integration is not connected for this workspace.')
    }
    return creds.apiKey
  }

  return {
    destination: 'attio',

    async listObjects(workspaceId: string): Promise<ObjectSchema[]> {
      const apiKey = await apiKeyFor(workspaceId)
      const attioObjects = await discoverObjects(apiKey)
      const attioSlugs = new Set(attioObjects.map((o) => o.slug))

      const wanted: ObjectSchema[] = []
      const objectDefs: Array<{ id: ObjectId; label: string; subjectKind: 'person' | 'group_org'; description: string }> = [
        {
          id: 'deals',
          label: 'Deals',
          subjectKind: 'group_org',
          description: 'Sourced from organizations with a trial or active subscription.',
        },
        {
          id: 'people',
          label: 'People',
          subjectKind: 'person',
          description: 'Sourced from persons with a known email.',
        },
        {
          id: 'companies',
          label: 'Companies',
          subjectKind: 'group_org',
          description: 'Sourced from organizations with a verified domain.',
        },
        {
          id: 'workspaces',
          label: 'Workspaces',
          subjectKind: 'group_org',
          description: 'Sourced from product workspaces / team accounts.',
        },
      ]

      for (const def of objectDefs) {
        const slug = OBJECT_TO_SLUG[def.id]
        if (!attioSlugs.has(slug)) continue
        // Defer field lookup — too expensive for an overview call. UI fetches per-object on expand.
        wanted.push({
          id: def.id,
          label: def.label,
          description: def.description,
          subjectKind: def.subjectKind,
          fields: [],
        })
      }
      return wanted
    },

    async listFields(workspaceId: string, objectId: ObjectId): Promise<FieldSchema[]> {
      const apiKey = await apiKeyFor(workspaceId)
      const slug = OBJECT_TO_SLUG[objectId]
      const attrs = await getObjectAttributes(apiKey, slug)
      return attrs.filter((a) => a.isWritable).map(attrToFieldSchema)
    },

    async fetchSampleSubjects(
      workspaceId: string,
      objectId: ObjectId,
      options: FetchSampleSubjectsOptions = {},
    ): Promise<SampleSubject[]> {
      return fetchSampleSubjects(supabase, workspaceId, objectId, options.limit ?? 10)
    },

    async sendTest(
      workspaceId: string,
      objectId: ObjectId,
      payload: Record<string, unknown>,
      rows: MappingRow[],
    ): Promise<SendTestResult> {
      try {
        const apiKey = await apiKeyFor(workspaceId)
        const slug = OBJECT_TO_SLUG[objectId]

        // Pick a matching attribute to enable upsert (defaults to 'domain' on companies/workspaces,
        // 'email_addresses' on people, or the first mapped field on deals).
        const matchOn = chooseMatchOn(objectId, rows)

        const result = await upsertRecord(apiKey, slug, payload, matchOn)
        return {
          status: 'success',
          code: 200,
          title: 'Test record created in Attio',
          detail: `Record ${result.recordId} ${result.action}.`,
          payload,
        }
      } catch (err) {
        return attioErrorToResult(err, payload)
      }
    },
  }
}

function attrToFieldSchema(attr: AttioAttribute): FieldSchema {
  return {
    id: attr.slug,
    label: attr.title,
    kind: attioKindToUiKind(attr.type),
    required: attr.isRequired,
    options: attr.selectOptions?.map((o) => o.value),
  }
}

function attioKindToUiKind(t: string): string {
  switch (t) {
    case 'text':
    case 'string':
      return 'text'
    case 'number':
      return 'number'
    case 'currency':
      return 'currency'
    case 'timestamp':
      return 'datetime'
    case 'date':
      return 'date'
    case 'select':
    case 'status':
      return 'select'
    case 'email-address':
      return 'email'
    case 'phone-number':
      return 'phone'
    case 'domain':
      return 'domain'
    case 'url':
      return 'url'
    case 'record-reference':
    case 'reference':
      return 'record'
    case 'location':
      return 'location'
    case 'checkbox':
      return 'boolean'
    default:
      return 'text'
  }
}

function chooseMatchOn(objectId: ObjectId, rows: MappingRow[]): string {
  const fieldIds = new Set(rows.map((r) => r.fieldId))
  if (objectId === 'people' && fieldIds.has('email_addresses')) return 'email_addresses'
  if (fieldIds.has('domain')) return 'domain'
  // Fallback — just pick the first mapped field.
  return rows[0]?.fieldId ?? 'domain'
}

function attioErrorToResult(err: unknown, payload: Record<string, unknown>): SendTestResult {
  if (err instanceof AttioAuthError) {
    return {
      status: 'error',
      code: 401,
      title: 'Attio rejected the request (401)',
      detail:
        'Your Attio API token is invalid or expired. Reconnect Attio under Data destinations.',
      action: 'Reconnect Attio',
      payload,
    }
  }
  if (err instanceof AttioRateLimitError) {
    return {
      status: 'error',
      code: 429,
      title: 'Rate limited (429)',
      detail: `Attio returned 429. Retry in ~${err.retryAfter}s.`,
      payload,
    }
  }
  if (err instanceof AttioValidationError) {
    return {
      status: 'error',
      code: 422,
      title: 'Validation failed (422)',
      detail: err.message,
      payload,
    }
  }
  if (err instanceof AttioNotFoundError) {
    return {
      status: 'error',
      code: 404,
      title: 'Attio resource not found',
      detail: err.message,
      payload,
    }
  }
  if (err instanceof AttioError) {
    return {
      status: 'error',
      code: 500,
      title: 'Attio error',
      detail: err.message,
      payload,
    }
  }
  return {
    status: 'error',
    code: 500,
    title: 'Unexpected error',
    detail: err instanceof Error ? err.message : 'Unknown error',
    payload,
  }
}
