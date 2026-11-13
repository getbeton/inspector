import {
  createHubSpotClientForWorkspace,
  upsertContact,
  upsertCompany,
  createDeal,
  HubSpotError,
  HubSpotAuthError,
  HubSpotRateLimitError,
  HubSpotNotFoundError,
  HubSpotValidationError,
  type HubSpotClient,
  type HubSpotPropertyDefinition,
  type UpsertResult,
} from '@/lib/integrations/hubspot'
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

/** HubSpot entity write ops (injectable for tests; default to the real `entities` module). */
interface HubSpotEntityOps {
  upsertContact: typeof upsertContact
  upsertCompany: typeof upsertCompany
  createDeal: typeof createDeal
}

export interface HubSpotDestinationDeps {
  supabase: SupabaseClient
  /** Resolve the HubSpot client for a workspace. Defaults to the integration_configs-backed factory. */
  getClient?: (workspaceId: string) => Promise<HubSpotClient>
  /** Override entity write ops (tests). */
  ops?: Partial<HubSpotEntityOps>
  /** Override the sample-subjects helper (tests). */
  sampleSubjects?: typeof fetchSampleSubjects
}

const OBJECT_DEFS: ReadonlyArray<{
  id: ObjectId
  hsType: string
  label: string
  subjectKind: 'person' | 'group_org'
  description: string
}> = [
  { id: 'people', hsType: 'contacts', label: 'Contacts', subjectKind: 'person', description: 'HubSpot contacts, matched to people by email.' },
  { id: 'companies', hsType: 'companies', label: 'Companies', subjectKind: 'group_org', description: 'HubSpot companies, matched to accounts by domain.' },
  { id: 'deals', hsType: 'deals', label: 'Deals', subjectKind: 'group_org', description: 'HubSpot deals created from product signals.' },
]

/** Canonical ObjectId → HubSpot object type. `workspaces` has no HubSpot equivalent. */
const OBJECT_TO_HS: Partial<Record<ObjectId, string>> = Object.fromEntries(
  OBJECT_DEFS.map((d) => [d.id, d.hsType]),
)

export function createHubSpotDestinationAdapter(deps: HubSpotDestinationDeps): DestinationAdapter {
  const { supabase } = deps
  const getClient = deps.getClient ?? ((workspaceId: string) => createHubSpotClientForWorkspace(workspaceId))
  const sampleSubjects = deps.sampleSubjects ?? fetchSampleSubjects
  const ops: HubSpotEntityOps = { upsertContact, upsertCompany, createDeal, ...deps.ops }

  return {
    destination: 'hubspot',

    async listObjects(): Promise<ObjectSchema[]> {
      // Fields are deferred — the UI fetches them per-object on expand (listFields).
      return OBJECT_DEFS.map(({ id, label, description, subjectKind }) => ({
        id,
        label,
        description,
        subjectKind,
        fields: [],
      }))
    },

    async listFields(workspaceId: string, objectId: ObjectId): Promise<FieldSchema[]> {
      const hsType = OBJECT_TO_HS[objectId]
      if (!hsType) return []
      const client = await getClient(workspaceId)
      const { results } = await client.getProperties(hsType)
      return results.filter((p) => !p.calculated && !p.hidden).map(propToFieldSchema)
    },

    async fetchSampleSubjects(
      workspaceId: string,
      objectId: ObjectId,
      options: FetchSampleSubjectsOptions = {},
    ): Promise<SampleSubject[]> {
      return sampleSubjects(supabase, workspaceId, objectId, options.limit ?? 10)
    },

    async sendTest(
      workspaceId: string,
      objectId: ObjectId,
      payload: Record<string, unknown>,
      _rows: MappingRow[],
      _fields: FieldSchema[],
    ): Promise<SendTestResult> {
      const hsType = OBJECT_TO_HS[objectId]
      if (!hsType) {
        return {
          status: 'error',
          code: 400,
          title: 'Unsupported object',
          detail: `HubSpot does not support the "${objectId}" object.`,
          payload,
        }
      }

      const client = await getClient(workspaceId)
      try {
        let result: UpsertResult
        if (objectId === 'people') {
          result = await ops.upsertContact(client, payload, 'email')
        } else if (objectId === 'companies') {
          result = await ops.upsertCompany(client, payload, 'domain')
        } else {
          result = await ops.createDeal(client, payload)
        }
        return {
          status: 'success',
          code: 200,
          title: `Test record ${result.action} in HubSpot`,
          detail: `Record ${result.recordId} ${result.action}.`,
          payload,
        }
      } catch (err) {
        return hubspotErrorToResult(err, payload)
      }
    },
  }
}

function propToFieldSchema(p: HubSpotPropertyDefinition): FieldSchema {
  const field: FieldSchema = {
    id: p.name,
    label: p.label,
    kind: hubspotKindToUiKind(p.type),
    required: false, // HubSpot exposes required-ness on the object schema, not per-property here.
    // 'checkbox' fieldType = multiple checkboxes (array); 'booleancheckbox' = single boolean.
    isMulti: p.fieldType === 'checkbox',
  }
  if (p.type === 'enumeration' && p.options?.length) {
    field.options = p.options.map((o) => o.value)
  }
  return field
}

function hubspotKindToUiKind(type: string): string {
  switch (type) {
    case 'string':
      return 'text'
    case 'number':
      return 'number'
    case 'date':
      return 'date'
    case 'datetime':
      return 'datetime'
    case 'enumeration':
      return 'select'
    case 'bool':
      return 'boolean'
    case 'phone_number':
      return 'phone'
    default:
      return 'text'
  }
}

function hubspotErrorToResult(err: unknown, payload: Record<string, unknown>): SendTestResult {
  if (err instanceof HubSpotAuthError) {
    return {
      status: 'error',
      code: 401,
      title: 'HubSpot rejected the request (401)',
      detail: 'Your HubSpot token is invalid or expired. Reconnect HubSpot under Data destinations.',
      action: 'Reconnect HubSpot',
      payload,
    }
  }
  if (err instanceof HubSpotRateLimitError) {
    return {
      status: 'error',
      code: 429,
      title: 'Rate limited (429)',
      detail: `HubSpot returned 429. Retry in ~${err.retryAfter}s.`,
      payload,
    }
  }
  if (err instanceof HubSpotValidationError) {
    return { status: 'error', code: 422, title: 'Validation failed (422)', detail: err.message, payload }
  }
  if (err instanceof HubSpotNotFoundError) {
    return { status: 'error', code: 404, title: 'HubSpot resource not found', detail: err.message, payload }
  }
  if (err instanceof HubSpotError) {
    return { status: 'error', code: 500, title: 'HubSpot error', detail: err.message, payload }
  }
  return {
    status: 'error',
    code: 500,
    title: 'Unexpected error',
    detail: err instanceof Error ? err.message : 'Unknown error',
    payload,
  }
}
