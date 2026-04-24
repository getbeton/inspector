import {
  createRecord,
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
      const apiKey = await apiKeyFor(workspaceId)
      const slug = OBJECT_TO_SLUG[objectId]

      try {
        // Pick a matching attribute for upsert only when a natural unique key
        // is in the payload. Otherwise fall back to create — Attio rejects
        // PUT /records when matching_attribute isn't unique (e.g. 'stage' on Deals).
        const matchOn = chooseMatchOn(objectId, payload)

        const result = matchOn
          ? await upsertRecord(apiKey, slug, payload, matchOn)
          : await createRecord(apiKey, slug, payload)

        return {
          status: 'success',
          code: 200,
          title: 'Test record created in Attio',
          detail: `Record ${result.recordId} ${result.action}.`,
          payload,
        }
      } catch (err) {
        // On error, best-effort fetch of the schema so we can translate
        // opaque attribute UUIDs in the message to human-readable names.
        let attrs: AttioAttribute[] = []
        try {
          attrs = await getObjectAttributes(apiKey, slug)
        } catch {}
        return attioErrorToResult(err, payload, attrs)
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

/**
 * Returns the attribute to upsert on, or null to force create-only.
 *
 * Attio's PUT /records endpoint requires the `matching_attribute` to actually
 * be a unique key on the object. Using a non-unique field (e.g. 'stage' on
 * Deals) is rejected with a 400. So we only return a match key when we're
 * confident the object supports it AND the payload carries a non-empty value
 * for that key.
 */
function chooseMatchOn(
  objectId: ObjectId,
  payload: Record<string, unknown>,
): string | null {
  const has = (k: string) => {
    const v = payload[k]
    return v !== null && v !== undefined && v !== ''
  }
  if (objectId === 'people' && has('email_addresses')) return 'email_addresses'
  if ((objectId === 'companies' || objectId === 'workspaces') && has('domain')) return 'domain'
  // Deals (and any other object without a safe natural key) → create-only.
  return null
}

function attioErrorToResult(
  err: unknown,
  payload: Record<string, unknown>,
  attrs: AttioAttribute[] = [],
): SendTestResult {
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
      detail: humanizeAttioMessage(err.message, attrs),
      payload,
    }
  }
  if (err instanceof AttioNotFoundError) {
    return {
      status: 'error',
      code: 404,
      title: 'Attio resource not found',
      detail: humanizeAttioMessage(err.message, attrs),
      payload,
    }
  }
  if (err instanceof AttioError) {
    return {
      status: 'error',
      code: 500,
      title: 'Attio error',
      detail: humanizeAttioMessage(err.message, attrs),
      payload,
    }
  }
  return {
    status: 'error',
    code: 500,
    title: 'Unexpected error',
    detail: humanizeAttioMessage(
      err instanceof Error ? err.message : 'Unknown error',
      attrs,
    ),
    payload,
  }
}

/**
 * Replace Attio attribute UUIDs in an error message with human-readable names.
 * Example:
 *   before: Required value for attribute with ID "50766a8f-b48b-47a0-8ae1-e546526787eb" was not provided.
 *   after:  Required value for attribute "Deal owner" (slug: owner) was not provided.
 *
 * Falls back to the original message if no match is found, so the user never
 * loses information even when the schema fetch has drifted.
 */
function humanizeAttioMessage(message: string, attrs: AttioAttribute[]): string {
  if (!message || attrs.length === 0) return message
  const byId = new Map(attrs.map((a) => [a.id, a]))
  return message.replace(
    /attribute with ID "([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/gi,
    (match, uuid) => {
      const attr = byId.get(uuid)
      if (!attr) return match
      return `attribute "${attr.title}" (slug: ${attr.slug})`
    },
  )
}
