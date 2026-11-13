/**
 * HubSpot Association Management
 *
 * Handles creating and managing associations between HubSpot CRM objects.
 * Uses HubSpot v4 association endpoints.
 *
 * Association type IDs (HubSpot-defined defaults):
 * - contact -> company: 1
 * - company -> contact: 2
 * - deal -> contact: 3
 * - contact -> deal: 4
 * - deal -> company: 5
 * - company -> deal: 342
 */

import type { HubSpotClient } from './client'
import { createModuleLogger } from '@/lib/utils/logger'

const log = createModuleLogger('[HubSpot Associations]')

// ============================================
// Association Type IDs
// ============================================

/**
 * Default HubSpot association type IDs.
 * These are the standard association types defined by HubSpot.
 */
export const ASSOCIATION_TYPE_IDS: Record<string, number> = {
  'contacts_to_companies': 1,
  'companies_to_contacts': 2,
  'deals_to_contacts': 3,
  'contacts_to_deals': 4,
  'deals_to_companies': 5,
  'companies_to_deals': 342,
}

/**
 * Get the association type ID for a given from/to object type pair.
 */
function getAssociationTypeId(fromType: string, toType: string): number | null {
  const key = `${fromType}_to_${toType}`
  return ASSOCIATION_TYPE_IDS[key] ?? null
}

// ============================================
// Types
// ============================================

export interface AssociationInput {
  fromType: string
  fromId: string
  toType: string
  toId: string
  associationTypeId?: number
}

// ============================================
// Single Association
// ============================================

/**
 * Create a single association between two CRM records.
 *
 * @param client - HubSpot API client
 * @param fromType - Source object type (e.g., 'contacts')
 * @param fromId - Source record ID
 * @param toType - Target object type (e.g., 'companies')
 * @param toId - Target record ID
 * @param associationTypeId - Optional explicit type ID (auto-resolved if omitted)
 */
export async function createAssociation(
  client: HubSpotClient,
  fromType: string,
  fromId: string,
  toType: string,
  toId: string,
  associationTypeId?: number
): Promise<void> {
  const typeId = associationTypeId ?? getAssociationTypeId(fromType, toType)

  if (typeId === null) {
    throw new Error(
      `Unknown association type: ${fromType} -> ${toType}. ` +
      `Provide an explicit associationTypeId.`
    )
  }

  await client.createAssociationV4(fromType, fromId, toType, toId, typeId)
  log.info(`Created association: ${fromType}/${fromId} -> ${toType}/${toId} (type ${typeId})`)
}

// ============================================
// Batch Associations
// ============================================

/** Maximum associations per batch request (HubSpot limit) */
const MAX_BATCH_SIZE = 2000

/**
 * Batch create associations between CRM records.
 * Automatically chunks into batches of 2000 (HubSpot limit).
 *
 * @param client - HubSpot API client
 * @param associations - Array of association inputs
 * @returns Count of successful and failed associations
 */
export async function batchCreateAssociations(
  client: HubSpotClient,
  associations: AssociationInput[]
): Promise<{ succeeded: number; failed: number }> {
  if (associations.length === 0) {
    return { succeeded: 0, failed: 0 }
  }

  // Group by from/to type pairs (batch API requires same types per call)
  const grouped = new Map<string, AssociationInput[]>()
  for (const assoc of associations) {
    const key = `${assoc.fromType}::${assoc.toType}`
    const group = grouped.get(key) || []
    group.push(assoc)
    grouped.set(key, group)
  }

  let succeeded = 0
  let failed = 0

  for (const [key, group] of grouped) {
    const [fromType, toType] = key.split('::')

    // Process in chunks of MAX_BATCH_SIZE
    for (let i = 0; i < group.length; i += MAX_BATCH_SIZE) {
      const chunk = group.slice(i, i + MAX_BATCH_SIZE)

      const inputs = chunk.map((assoc) => {
        const typeId =
          assoc.associationTypeId ?? getAssociationTypeId(fromType, toType)

        if (typeId === null) {
          throw new Error(
            `Unknown association type: ${fromType} -> ${toType}. ` +
            `Provide an explicit associationTypeId.`
          )
        }

        return {
          from: { id: assoc.fromId },
          to: { id: assoc.toId },
          types: [
            {
              associationCategory: 'HUBSPOT_DEFINED',
              associationTypeId: typeId,
            },
          ],
        }
      })

      try {
        await client.batchCreateAssociationsV4(fromType, toType, inputs)
        succeeded += chunk.length
        log.info(
          `Batch created ${chunk.length} associations: ${fromType} -> ${toType}`
        )
      } catch (err) {
        failed += chunk.length
        log.error(
          `Batch association creation failed for ${fromType} -> ${toType}:`,
          err
        )
      }
    }
  }

  return { succeeded, failed }
}
