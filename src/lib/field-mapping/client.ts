/**
 * Browser-safe re-exports.
 *
 * This file must not (transitively) import `@/lib/supabase/server`, `next/headers`,
 * `@/lib/integrations/credentials`, or any other server-only module — otherwise
 * bundlers will pull server code into client bundles and Next.js will refuse to
 * build.
 *
 * Client React components should import from `@/lib/field-mapping/client`.
 * Server code (API routes, server components) imports from `@/lib/field-mapping`.
 */

export type {
  Destination,
  FetchSampleSubjectsOptions,
  FieldSchema,
  ImpactSummary,
  LinkOutcome,
  MappingRow,
  ObjectId,
  ObjectSchema,
  SampleSubject,
  SendTestResult,
  Source,
  WorkspaceMember,
} from './types'

export { BETON_PROPERTIES, type BetonProperty } from './beton-properties'

export { buildPayload, evalSource, isLinkMarker, type LinkMarker } from './payload'
