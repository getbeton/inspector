/**
 * Source connector framework — read CRM/event records IN to the warehouse.
 * Mirror of `@/lib/field-mapping` (destination/write side).
 */
export {
  _resetSourceRegistry,
  getSourceAdapter,
  listRegisteredSources,
  registerSourceAdapter,
  SourceAdapterNotFoundError,
  type SourceAdapter,
} from './adapter'

export {
  CANONICAL_OBJECT_IDS,
  canonicalObjectId,
  subjectKindFor,
} from './normalize'

export type {
  ListRecordsOptions,
  RecordPage,
  SourceConnector,
  SourceFieldSchema,
  SourceObjectSchema,
  SourceRecord,
} from './types'

// Side-effect: register built-in source adapters so `getSourceAdapter()` resolves.
// Placed last so all of this module's exports are defined before the registration
// module (and the connector adapters it imports) reference them — avoids cycle hazards.
import './register'
