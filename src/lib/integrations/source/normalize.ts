/**
 * Canonical-object normalization.
 *
 * Maps a source's native object keys to the canonical `ObjectId` set shared with
 * the destination/field-mapping framework, so source records and destination
 * mappings line up on the same object vocabulary. Objects that have no canonical
 * equivalent stay source-native (`canonicalObjectId` returns `null`).
 */
import type { ObjectId } from '@/lib/field-mapping/types'

/** Canonical objects shared with `@/lib/field-mapping` (`Destination`/`ObjectId`). */
export const CANONICAL_OBJECT_IDS: readonly ObjectId[] = [
  'deals',
  'people',
  'companies',
  'workspaces',
]

/**
 * Per-connector map from a source's native object key (in the source's own casing)
 * to a canonical `ObjectId`. Only genuinely-corresponding objects are listed;
 * everything else is intentionally absent and stays source-native.
 */
const NATIVE_TO_CANONICAL: Record<string, Readonly<Record<string, ObjectId>>> = {
  hubspot: { contacts: 'people', companies: 'companies', deals: 'deals' },
  pipedrive: { persons: 'people', organizations: 'companies', deals: 'deals' },
  zoho: { Contacts: 'people', Accounts: 'companies', Deals: 'deals' },
  // segment: profiles are not canonical CRM objects → no mapping
}

const PERSON_OBJECTS: ReadonlySet<ObjectId> = new Set<ObjectId>(['people'])
const GROUP_OBJECTS: ReadonlySet<ObjectId> = new Set<ObjectId>(['companies'])

/** Map a source-native object key to a canonical `ObjectId`, or `null` if source-specific. */
export function canonicalObjectId(source: string, nativeObject: string): ObjectId | null {
  return NATIVE_TO_CANONICAL[source]?.[nativeObject] ?? null
}

/** PostHog subject kind for a canonical object, when it has one. */
export function subjectKindFor(canonical: ObjectId | null): 'person' | 'group_org' | undefined {
  if (canonical && PERSON_OBJECTS.has(canonical)) return 'person'
  if (canonical && GROUP_OBJECTS.has(canonical)) return 'group_org'
  return undefined
}
