import type { Destination, MappingRow, ObjectId, Source } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

/**
 * CRUD for the field_mappings table (migration 20260423125952_field_mappings_v2).
 *
 * Each row in the table corresponds to one (workspace, destination, object, field).
 * The table has a discriminated `source_type` column so queries stay relational.
 */

interface FieldMappingDbRow {
  id: string
  workspace_id: string
  destination: string
  object_id: string
  field_id: string
  source_type: string
  source_prop: string | null
  source_prop_kind: string | null
  source_transform: string | null
  source_formula: string | null
  source_option: string | null
  match_on: string | null
  link_target_object: string | null
  link_record_id: string | null
  updated_at: string
}

export async function listMappings(
  supabase: SupabaseClient,
  workspaceId: string,
  destination: Destination,
): Promise<Record<ObjectId, MappingRow[]>> {
  const { data, error } = await (supabase as any)
    .from('field_mappings')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('destination', destination)

  if (error) throw new Error(`listMappings failed: ${error.message}`)

  const byObject: Record<string, MappingRow[]> = {
    deals: [],
    people: [],
    companies: [],
    workspaces: [],
  }

  for (const raw of (data ?? []) as FieldMappingDbRow[]) {
    const objectId = raw.object_id as ObjectId
    byObject[objectId] = byObject[objectId] ?? []
    byObject[objectId].push(dbRowToMappingRow(raw))
  }

  return byObject as Record<ObjectId, MappingRow[]>
}

export async function replaceMappingsForObject(
  supabase: SupabaseClient,
  workspaceId: string,
  destination: Destination,
  objectId: ObjectId,
  rows: MappingRow[],
): Promise<void> {
  // Strategy: delete-then-insert for this (workspace, destination, object) triplet.
  // Simpler than diffing. Unique constraint prevents dupes.
  const { error: delErr } = await (supabase as any)
    .from('field_mappings')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('destination', destination)
    .eq('object_id', objectId)

  if (delErr) throw new Error(`replaceMappingsForObject delete failed: ${delErr.message}`)

  if (rows.length === 0) return

  const records = rows.map((r) => mappingRowToDbInsert(workspaceId, destination, objectId, r))

  const { error: insErr } = await (supabase as any).from('field_mappings').insert(records)

  if (insErr) throw new Error(`replaceMappingsForObject insert failed: ${insErr.message}`)
}

export async function replaceAllMappings(
  supabase: SupabaseClient,
  workspaceId: string,
  destination: Destination,
  byObject: Record<ObjectId, MappingRow[]>,
): Promise<void> {
  for (const [objectId, rows] of Object.entries(byObject)) {
    await replaceMappingsForObject(supabase, workspaceId, destination, objectId as ObjectId, rows)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Row serialization
// ─────────────────────────────────────────────────────────────────────────────

function dbRowToMappingRow(raw: FieldMappingDbRow): MappingRow {
  return {
    id: raw.id,
    fieldId: raw.field_id,
    source: dbToSource(raw),
    savedAt: raw.updated_at,
    matchOn: raw.match_on,
  }
}

function dbToSource(raw: FieldMappingDbRow): Source {
  switch (raw.source_type) {
    case 'property':
      return {
        type: 'property',
        prop: raw.source_prop ?? '',
        propKind: (raw.source_prop_kind as Source extends { propKind: infer K } ? K : never) ?? 'person',
        transform: raw.source_transform ?? undefined,
      }
    case 'formula':
      return { type: 'formula', expr: raw.source_formula ?? '' }
    case 'option':
      return { type: 'option', value: raw.source_option ?? '' }
    case 'link_subject_person':
      return { type: 'link_subject_person' }
    case 'link_subject_company_by_domain':
      return { type: 'link_subject_company_by_domain' }
    case 'link_subject_company_via_person':
      return { type: 'link_subject_company_via_person' }
    case 'link_specific_record':
      return {
        type: 'link_specific_record',
        targetObject: (raw.link_target_object as ObjectId) ?? 'people',
        recordId: raw.link_record_id ?? '',
      }
    case 'actor_subject_email':
      return { type: 'actor_subject_email' }
    case 'actor_account_owner':
      return { type: 'actor_account_owner' }
    default:
      return { type: 'none' }
  }
}

function mappingRowToDbInsert(
  workspaceId: string,
  destination: Destination,
  objectId: ObjectId,
  row: MappingRow,
): Record<string, unknown> {
  const src = row.source ?? { type: 'none' as const }
  const base: Record<string, unknown> = {
    workspace_id: workspaceId,
    destination,
    object_id: objectId,
    field_id: row.fieldId,
    source_type: src.type,
    source_prop: null,
    source_prop_kind: null,
    source_transform: null,
    source_formula: null,
    source_option: null,
    link_target_object: null,
    link_record_id: null,
    match_on: row.matchOn ?? null,
  }
  if (src.type === 'property') {
    base.source_prop = src.prop
    base.source_prop_kind = src.propKind
    base.source_transform = src.transform ?? null
  } else if (src.type === 'formula') {
    base.source_formula = src.expr
  } else if (src.type === 'option') {
    base.source_option = src.value
  } else if (src.type === 'link_specific_record') {
    base.link_target_object = src.targetObject
    base.link_record_id = src.recordId
  }
  // link_subject_person, link_subject_company_*, actor_* — no extra columns
  return base
}
