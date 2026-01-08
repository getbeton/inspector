/**
 * Attio CRM Integration
 *
 * Exports all Attio client functionality for CRM synchronization.
 */

export {
  // Errors
  AttioError,
  AttioAuthError,
  AttioRateLimitError,
  AttioNotFoundError,
  AttioValidationError,
  // Types
  type AttioObject,
  type AttioAttribute,
  type AttioRecord,
  type AttioUpsertResult,
  type AttioConnectionResult,
  type AttioHealthResult,
  // Functions
  validateConnection,
  discoverObjects,
  getObjectAttributes,
  createAttribute,
  upsertRecord,
  getRecord,
  searchRecords,
  healthCheck,
  testConnection,
} from './client'
