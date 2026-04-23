import type {
  Destination,
  FetchSampleSubjectsOptions,
  MappingRow,
  ObjectId,
  ObjectSchema,
  SampleSubject,
  SendTestResult,
} from './types'

/**
 * Interface every CRM destination implements.
 *
 * One adapter per destination (Attio, HubSpot, ...). The UI and API routes talk
 * to the adapter, never to the underlying CRM client directly.
 */
export interface DestinationAdapter {
  readonly destination: Destination

  /** List the objects this destination exposes (deals, people, companies, workspaces). */
  listObjects(workspaceId: string): Promise<ObjectSchema[]>

  /** List writable fields on a given object, including options for select kinds. */
  listFields(workspaceId: string, objectId: ObjectId): Promise<ObjectSchema['fields']>

  /** Sample subjects for the live-preview picker (filtered by object's subject kind). */
  fetchSampleSubjects(
    workspaceId: string,
    objectId: ObjectId,
    options?: FetchSampleSubjectsOptions,
  ): Promise<SampleSubject[]>

  /**
   * Send a test record to the destination's sandbox.
   * The payload is pre-built by the caller (via buildPayload + formula engine).
   */
  sendTest(
    workspaceId: string,
    objectId: ObjectId,
    payload: Record<string, unknown>,
    rows: MappingRow[],
  ): Promise<SendTestResult>
}

export class AdapterNotFoundError extends Error {
  constructor(destination: string) {
    super(`No adapter registered for destination "${destination}"`)
    this.name = 'AdapterNotFoundError'
  }
}

const registry = new Map<Destination, DestinationAdapter>()

export function registerAdapter(adapter: DestinationAdapter): void {
  registry.set(adapter.destination, adapter)
}

export function getAdapter(destination: Destination): DestinationAdapter {
  const a = registry.get(destination)
  if (!a) throw new AdapterNotFoundError(destination)
  return a
}

export function listRegisteredDestinations(): Destination[] {
  return Array.from(registry.keys())
}
