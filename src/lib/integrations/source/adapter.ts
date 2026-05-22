/**
 * Source adapter interface + registry.
 *
 * Parallel to `DestinationAdapter` (`@/lib/field-mapping/adapter`): destination
 * adapters write records OUT, source adapters read records IN. Connectors register
 * once at module load; API routes and (later) F1 sync runs resolve via
 * `getSourceAdapter()`. The registry pattern intentionally mirrors the destination
 * registry so the two halves look and behave identically.
 */
import type {
  ListRecordsOptions,
  RecordPage,
  SourceConnector,
  SourceFieldSchema,
  SourceObjectSchema,
} from './types'

/** Interface every source connector implements (reads records IN to the warehouse). */
export interface SourceAdapter {
  readonly source: SourceConnector

  /** Verify credentials / connectivity for a workspace. */
  testConnection(workspaceId: string): Promise<{ ok: boolean; error?: string }>

  /** Object types this source exposes, normalized to a canonical `ObjectId` where possible. */
  listObjects(workspaceId: string): Promise<SourceObjectSchema[]>

  /** Field/property schema for a single object (source-native object key). */
  listFields(workspaceId: string, object: string): Promise<SourceFieldSchema[]>

  /**
   * Incremental, paginated pull for one object.
   * `options.since` is the watermark; the returned `RecordPage` carries the next
   * cursor and the max `updatedAt` so the caller can advance the watermark.
   */
  listRecords(
    workspaceId: string,
    object: string,
    options?: ListRecordsOptions,
  ): Promise<RecordPage>
}

export class SourceAdapterNotFoundError extends Error {
  constructor(source: string) {
    super(`No source adapter registered for "${source}"`)
    this.name = 'SourceAdapterNotFoundError'
  }
}

const registry = new Map<SourceConnector, SourceAdapter>()

/** Register a source adapter (idempotent per `source` — last registration wins). */
export function registerSourceAdapter(adapter: SourceAdapter): void {
  registry.set(adapter.source, adapter)
}

/** Resolve a registered source adapter, or throw `SourceAdapterNotFoundError`. */
export function getSourceAdapter(source: SourceConnector): SourceAdapter {
  const adapter = registry.get(source)
  if (!adapter) throw new SourceAdapterNotFoundError(source)
  return adapter
}

/** List the source names currently registered. */
export function listRegisteredSources(): SourceConnector[] {
  return Array.from(registry.keys())
}

/** Test-only: clear the registry between tests. Not for production use. */
export function _resetSourceRegistry(): void {
  registry.clear()
}
