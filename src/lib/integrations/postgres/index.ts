/**
 * Postgres Data Source Integration
 *
 * Barrel export for the Postgres data source module.
 */

// Types
export type {
  PostgresConnectionConfig,
  ParsedConnectionFields,
  DataSourceRecord,
  DataSourcePublic,
  DataSourceStatus,
  PostgresQueryResult,
  PostgresExplainResult,
  PostgresSchemaInfo,
  PostgresTableInfo,
  PostgresColumnInfo,
  PostgresTableStats,
  CreateDataSourceRequest,
  UpdateDataSourceRequest,
} from './types'

// Connection string utilities
export { parseConnectionString, buildConnectionConfig } from './connection-string'

// Security
export { validatePostgresHost, PostgresQueryValidator } from './security'

// Client operations
export {
  withPostgresConnection,
  testConnection,
  listSchemas,
  listTables,
  listColumns,
  executeQuery,
  explainQuery,
  getTableStats,
} from './client'

// Credential management
export {
  listDataSources,
  getDataSource,
  getDataSourceAdmin,
  getDataSourceByNameAdmin,
  listDataSourcesAdmin,
  hasConnectedPostgresSource,
  updateDataSourceStatus,
} from './credentials'

// Concurrency
export {
  acquireConnectionSlot,
  releaseConnectionSlot,
  getConnectionStats,
} from './concurrency'
