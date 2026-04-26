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
import { resolveAttioLinks } from './resolve-links'
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
      fields: FieldSchema[],
    ): Promise<SendTestResult> {
      const apiKey = await apiKeyFor(workspaceId)
      const slug = OBJECT_TO_SLUG[objectId]

      // 1. Resolve entity-linking markers in the payload into real record-ref
      //    arrays / email arrays via Attio assert calls. Records the per-field
      //    outcome so the TestModal can render which links matched vs created.
      const resolved = await resolveAttioLinks(payload, fields, apiKey, {
        autoLinkPersonToCompany: true,
      })

      // 2. Re-shape any remaining primitive values that need Attio's wire
      //    form (email-address, phone-number, etc.). Already-resolved
      //    record-ref arrays pass through unchanged.
      const shaped = shapeAttioPayload(resolved.payload, fields)

      try {
        // Pick a matching attribute for upsert only when a natural unique key
        // is in the payload. Otherwise fall back to create — Attio rejects
        // PUT /records when matching_attribute isn't unique (e.g. 'stage' on Deals).
        const matchOn = chooseMatchOn(objectId, shaped)

        const result = matchOn
          ? await upsertRecord(apiKey, slug, shaped, matchOn)
          : await createRecord(apiKey, slug, shaped)

        return {
          status: 'success',
          code: 200,
          title: 'Test record created in Attio',
          detail: `Record ${result.recordId} ${result.action}.`,
          payload: shaped,
          outcomes: resolved.outcomes,
          webUrl: result.webUrl,
        }
      } catch (err) {
        // On error, best-effort fetch of the schema so we can translate
        // opaque attribute UUIDs in the message to human-readable names.
        let attrs: AttioAttribute[] = []
        try {
          attrs = await getObjectAttributes(apiKey, slug)
        } catch {}
        const result = attioErrorToResult(err, shaped, attrs)
        return { ...result, outcomes: resolved.outcomes }
      }
    },
  }
}

function attrToFieldSchema(attr: AttioAttribute): FieldSchema {
  const slugs = attr.targetObjectSlugs ?? []
  const mapped = slugs
    .map((s) => attioSlugToObjectId(s))
    .filter((o): o is ObjectId => o !== null)
  return {
    id: attr.slug,
    label: attr.title,
    kind: attioKindToUiKind(attr.type),
    required: attr.isRequired,
    options: attr.selectOptions?.map((o) => o.value),
    isMulti: attr.isMulti,
    targetObjectId: mapped[0],
  }
}

function attioSlugToObjectId(slug: string): ObjectId | null {
  if (slug === 'deals') return 'deals'
  if (slug === 'people') return 'people'
  if (slug === 'companies') return 'companies'
  if (slug === 'workspaces') return 'workspaces'
  return null
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
    case 'actor-reference':
      return 'actor'
    case 'location':
      return 'location'
    case 'checkbox':
      return 'boolean'
    default:
      return 'text'
  }
}

/**
 * Reshape a generic {fieldId: rawValue} payload into Attio's wire format.
 *
 * Most Attio attributes accept a primitive "shorthand" (e.g. "name": "Jane"),
 * but structured types (email-address, phone-number, personal-name, location,
 * record-reference) require the full array-of-object form. Applying the
 * shaping here lets the rest of the stack (formula engine, buildPayload,
 * send-test route) stay destination-agnostic.
 */
function shapeAttioPayload(
  payload: Record<string, unknown>,
  fields: FieldSchema[],
): Record<string, unknown> {
  const byId = new Map(fields.map((f) => [f.id, f]))
  const out: Record<string, unknown> = {}
  for (const [fieldId, value] of Object.entries(payload)) {
    if (value === null || value === undefined || value === '') continue
    const field = byId.get(fieldId)
    if (!field) {
      // Unknown field — pass through so Attio can 400 with a clear message.
      out[fieldId] = value
      continue
    }
    out[fieldId] = shapeAttioValue(field, value)
  }
  return out
}

function shapeAttioValue(field: FieldSchema, value: unknown): unknown {
  // Already shaped by the caller (e.g. formula returned an object) — trust it.
  if (Array.isArray(value)) return value
  if (typeof value === 'object' && value !== null) return value

  const str = String(value)
  switch (field.kind) {
    case 'email':
      return [{ email_address: str }]
    case 'phone':
      return [{ original_phone_number: str }]
    case 'personal_name':
    case 'personal-name':
      return [{ full_name: str }]
    case 'location':
      // Treat bare strings as a single-line address. Users who want more
      // structure can emit a JSON object from a formula.
      return [{ line_1: str }]
    case 'domain':
      // Attio domain attributes are always array-of-objects, even for single values.
      return [{ domain: str }]
    case 'boolean': {
      // Coerce any truthy string ("true", "TRUE", "1", "yes") to true; everything
      // else (including the string "false") becomes false. Lets formula expressions
      // and string-typed property sources flow through cleanly.
      if (typeof value === 'boolean') return value
      const v = str.trim().toLowerCase()
      return v === 'true' || v === '1' || v === 'yes' || v === 'y'
    }
    case 'record':
    case 'ref':
      // Record references need {target_object, target_record_id}. We don't
      // resolve references here — pass the raw value through so Attio returns
      // a clear per-attribute error (which humanizeAttioMessage will friendly).
      return value
    default: {
      // Multi-select with a non-array primitive: wrap in array so Attio doesn't
      // reject with "expected array but received single value".
      if (field.isMulti) return [value]
      // text, number, currency, date, datetime, select, status, url — Attio
      // accepts primitive shorthand.
      return value
    }
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
