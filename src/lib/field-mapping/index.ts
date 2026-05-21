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

export {
  AdapterNotFoundError,
  type DestinationAdapter,
  getAdapter,
  listRegisteredDestinations,
  registerAdapter,
} from './adapter'

export { createAttioAdapter } from './attio-adapter'

export { createHubSpotDestinationAdapter } from './hubspot-adapter'

export {
  listMappings,
  replaceAllMappings,
  replaceMappingsForObject,
} from './store'

export { buildPayload, evalSource } from './payload'

export { fetchSampleSubjects } from './sample-subjects'
