/**
 * Audit Logging for Service Role Key Operations
 *
 * Provides structured audit logging for privileged operations that bypass RLS.
 * Logs to both console (for Vercel log aggregation) and the billing_events table
 * when workspace context is available.
 *
 * All service role operations (cron jobs, webhooks) should use this utility
 * to maintain an audit trail for debugging and compliance.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/lib/supabase/types';

// ============================================
// Types
// ============================================

export interface AuditEntry {
  /** The operation being performed */
  operation: string;
  /** Target table being accessed */
  table: string;
  /** Workspace ID if applicable */
  workspaceId?: string;
  /** Number of records affected */
  recordCount?: number;
  /** Operation type */
  action: 'read' | 'insert' | 'update' | 'delete';
  /** Caller context (e.g., 'mtu-cron', 'stripe-webhook') */
  source: string;
  /** Additional metadata */
  metadata?: Record<string, Json | undefined>;
  /** Duration of the operation in milliseconds */
  durationMs?: number;
  /** Whether the operation succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

// ============================================
// Audit Logger
// ============================================

/**
 * Logs a privileged (service role) operation for audit purposes.
 * Always logs to console with structured format for log aggregation.
 * Optionally persists to billing_events when workspace context exists.
 */
export async function auditLog(entry: AuditEntry): Promise<void> {
  const timestamp = new Date().toISOString();
  const logPrefix = `[Audit][${entry.source}]`;

  // Structured console log (always emitted for Vercel log drain)
  const logData = {
    timestamp,
    operation: entry.operation,
    table: entry.table,
    action: entry.action,
    source: entry.source,
    workspaceId: entry.workspaceId ?? null,
    recordCount: entry.recordCount ?? null,
    durationMs: entry.durationMs ?? null,
    success: entry.success,
    error: entry.error ?? null,
  };

  if (entry.success) {
    console.log(
      `${logPrefix} ${entry.action.toUpperCase()} ${entry.table}: ${entry.operation}` +
        (entry.recordCount !== undefined ? ` (${entry.recordCount} records)` : '') +
        (entry.durationMs !== undefined ? ` [${entry.durationMs}ms]` : ''),
      JSON.stringify(logData)
    );
  } else {
    console.error(
      `${logPrefix} FAILED ${entry.action.toUpperCase()} ${entry.table}: ${entry.operation}` +
        (entry.error ? ` — ${entry.error}` : ''),
      JSON.stringify(logData)
    );
  }

  // Persist to billing_events if workspace context is available
  if (entry.workspaceId) {
    try {
      const supabase = createAdminClient();
      await supabase.from('billing_events').insert({
        workspace_id: entry.workspaceId,
        event_type: `audit_${entry.action}_${entry.table}`,
        event_data: {
          ...logData,
          ...(entry.metadata ?? {}),
        } as unknown as Json,
      });
    } catch {
      // Never let audit logging failure break the main operation
      console.warn(`${logPrefix} Failed to persist audit log to database`);
    }
  }
}

/**
 * Creates a scoped audit logger for a specific source (e.g., 'mtu-cron').
 * Returns an `auditLog` function with the source pre-filled.
 */
export function createAuditLogger(source: string) {
  return (entry: Omit<AuditEntry, 'source'>) =>
    auditLog({ ...entry, source });
}

/**
 * Wraps an async operation with audit logging.
 * Automatically tracks duration, success/failure, and logs the result.
 */
export async function withAuditLog<T>(
  entry: Omit<AuditEntry, 'success' | 'error' | 'durationMs'>,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    await auditLog({
      ...entry,
      success: true,
      durationMs: Date.now() - start,
    });
    return result;
  } catch (err) {
    await auditLog({
      ...entry,
      success: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    });
    throw err;
  }
}
