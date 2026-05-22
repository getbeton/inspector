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
