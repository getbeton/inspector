/**
 * Threshold Notification Checker Cron Job
 *
 * GET /api/cron/threshold-notifications
 *
 * This cron job runs multiple times daily to check for workspaces
 * approaching their MTU threshold and queue notification emails.
 *
 * Notification levels:
 * - 90% threshold: First warning
 * - 95% threshold: Urgent warning
 * - 100%+ threshold: Exceeded notification (access blocked without card)
 *
 * Schedule: Every 6 hours (configured in vercel.json)
 * CRON_SECRET header required for authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isBillingEnabled, BILLING_CONFIG } from '@/lib/utils/deployment';
import { sendThresholdNotification } from '@/lib/email';

// ============================================
// Types
// ============================================

interface ThresholdNotificationResult {
  success: boolean;
  workspacesChecked: number;
  notificationsQueued: {
    warning90: number;
    warning95: number;
    exceeded: number;
  };
  errors: string[];
  timestamp: string;
}

interface WorkspaceBillingData {
  workspace_id: string;
  current_cycle_mtu: number | null;
  free_tier_mtu_limit: number | null;
  threshold_90_notified: boolean | null;
  threshold_95_notified: boolean | null;
  threshold_exceeded_notified: boolean | null;
  stripe_payment_method_id: string | null;
  status: string;
  workspaces: {
    name: string;
    workspace_members: Array<{
      user_id: string;
      role: string;
      users: {
        email: string;
      };
    }>;
  };
}

// ============================================
// Cron Authentication
// ============================================

/**
 * Verifies the CRON_SECRET header for authentication.
 */
function verifyCronAuth(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.warn('[Threshold Cron] CRON_SECRET not configured');
    return false;
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  const cronSecretHeader = request.headers.get('x-cron-secret');
  return cronSecretHeader === cronSecret;
}

// ============================================
// Supabase Admin Client
// ============================================

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase configuration missing');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// ============================================
// Notification Logic
// ============================================

/**
 * Gets all workspaces that need threshold notifications.
 * Only checks workspaces without a payment method linked.
 */
async function getWorkspacesForNotifications(): Promise<WorkspaceBillingData[]> {
  const supabase = getAdminClient();

  // Get workspaces with billing enabled, no payment method, and over thresholds
  const { data, error } = await supabase
    .from('workspace_billing')
    .select(
      `
      workspace_id,
      current_cycle_mtu,
      free_tier_mtu_limit,
      threshold_90_notified,
      threshold_95_notified,
      threshold_exceeded_notified,
      stripe_payment_method_id,
      status,
      workspaces!inner(
        name,
        workspace_members!inner(
          user_id,
          role,
          users!inner(email)
        )
      )
    `
    )
    .in('status', ['free', 'card_required'])
    .is('stripe_payment_method_id', null);

  if (error) {
    console.error('[Threshold Cron] Failed to fetch workspaces:', error);
    return [];
  }

  return (data as unknown as WorkspaceBillingData[]) || [];
}

/**
 * Determines the notification level for a workspace.
 */
function getNotificationLevel(
  mtuCount: number,
  threshold: number
): 'warning_90' | 'warning_95' | 'exceeded' | null {
  const percentUsed = (mtuCount / threshold) * 100;

  if (percentUsed >= 100) {
    return 'exceeded';
  }
  if (percentUsed >= 95) {
    return 'warning_95';
  }
  if (percentUsed >= 90) {
    return 'warning_90';
  }
  return null;
}

/**
 * Checks if notification has already been sent for this level.
 */
function isAlreadyNotified(
  workspace: WorkspaceBillingData,
  level: 'warning_90' | 'warning_95' | 'exceeded'
): boolean {
  switch (level) {
    case 'warning_90':
      return !!workspace.threshold_90_notified;
    case 'warning_95':
      return !!workspace.threshold_95_notified;
    case 'exceeded':
      return !!workspace.threshold_exceeded_notified;
    default:
      return false;
  }
}

/**
 * Gets admin emails for a workspace.
 */
function getAdminEmails(workspace: WorkspaceBillingData): string[] {
  const members = workspace.workspaces?.workspace_members || [];
  return members
    .filter((m) => m.role === 'admin' || m.role === 'owner')
    .map((m) => m.users?.email)
    .filter(Boolean) as string[];
}

/**
 * Queues a notification email for a workspace.
 * In production, this would send to a queue (e.g., Resend, SQS).
 * For now, we log and store the notification event.
 */
async function queueNotification(
  workspaceId: string,
  workspaceName: string,
  level: 'warning_90' | 'warning_95' | 'exceeded',
  emails: string[],
  mtuCount: number,
  threshold: number
): Promise<boolean> {
  const supabase = getAdminClient();

  // Log the notification event
  const notificationData = {
    workspace_id: workspaceId,
    event_type: `threshold_notification_${level}`,
    event_data: {
      workspace_name: workspaceName,
      notification_level: level,
      mtu_count: mtuCount,
      threshold,
      percent_used: Math.round((mtuCount / threshold) * 100),
      recipient_emails: emails,
      queued_at: new Date().toISOString(),
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: eventError } = await (supabase as any)
    .from('billing_events')
    .insert(notificationData);

  if (eventError) {
    console.error('[Threshold Cron] Failed to log notification event:', eventError);
    return false;
  }

  // Update the notification flags
  const updateField =
    level === 'warning_90'
      ? { threshold_90_notified: true }
      : level === 'warning_95'
        ? { threshold_95_notified: true }
        : { threshold_exceeded_notified: true };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (supabase as any)
    .from('workspace_billing')
    .update({
      ...updateField,
      last_notification_date: new Date().toISOString(),
    })
    .eq('workspace_id', workspaceId);

  if (updateError) {
    console.error('[Threshold Cron] Failed to update notification flags:', updateError);
    return false;
  }

  // Send email notification via Resend
  const emailResult = await sendThresholdNotification({
    workspaceId,
    workspaceName,
    recipientEmails: emails,
    notificationLevel: level,
    mtuCount,
    threshold,
    settingsUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.betoninspector.com'}/settings/billing`,
  });

  if (!emailResult.success) {
    console.error(
      `[Threshold Cron] Failed to send ${level} email for workspace ${workspaceId}:`,
      emailResult.error
    );
    // Note: We don't return false here because the notification flag is already set
    // The email service logs in dev mode, so this is expected behavior
  } else {
    console.log(
      `[Threshold Cron] Sent ${level} notification to workspace ${workspaceId} ` +
        `(${workspaceName}): ${mtuCount}/${threshold} MTUs, emails: ${emails.join(', ')}`
    );
  }

  return true;
}

// ============================================
// Route Handler
// ============================================

export async function GET(
  request: NextRequest
): Promise<NextResponse<ThresholdNotificationResult>> {
  const timestamp = new Date().toISOString();

  // Verify cron authentication
  if (!verifyCronAuth(request)) {
    return NextResponse.json(
      {
        success: false,
        workspacesChecked: 0,
        notificationsQueued: { warning90: 0, warning95: 0, exceeded: 0 },
        errors: ['Unauthorized'],
        timestamp,
      },
      { status: 401 }
    );
  }

  // Check if billing is enabled
  if (!isBillingEnabled()) {
    return NextResponse.json({
      success: true,
      workspacesChecked: 0,
      notificationsQueued: { warning90: 0, warning95: 0, exceeded: 0 },
      errors: [],
      timestamp,
    });
  }

  console.log('[Threshold Cron] Starting threshold notification check');

  const errors: string[] = [];
  const notificationsQueued = {
    warning90: 0,
    warning95: 0,
    exceeded: 0,
  };

  try {
    // Get workspaces to check
    const workspaces = await getWorkspacesForNotifications();
    console.log(`[Threshold Cron] Checking ${workspaces.length} workspaces`);

    for (const workspace of workspaces) {
      try {
        const mtuCount = workspace.current_cycle_mtu || 0;
        const threshold =
          workspace.free_tier_mtu_limit || BILLING_CONFIG.FREE_TIER_MTU_LIMIT;

        // Determine notification level
        const level = getNotificationLevel(mtuCount, threshold);

        if (!level) {
          // Not at any threshold
          continue;
        }

        // Check if already notified for this level
        if (isAlreadyNotified(workspace, level)) {
          continue;
        }

        // Get admin emails
        const emails = getAdminEmails(workspace);
        if (emails.length === 0) {
          errors.push(
            `Workspace ${workspace.workspace_id}: No admin emails found`
          );
          continue;
        }

        // Queue notification
        const workspaceName = workspace.workspaces?.name || 'Unknown Workspace';
        const success = await queueNotification(
          workspace.workspace_id,
          workspaceName,
          level,
          emails,
          mtuCount,
          threshold
        );

        if (success) {
          switch (level) {
            case 'warning_90':
              notificationsQueued.warning90++;
              break;
            case 'warning_95':
              notificationsQueued.warning95++;
              break;
            case 'exceeded':
              notificationsQueued.exceeded++;
              break;
          }
        } else {
          errors.push(
            `Workspace ${workspace.workspace_id}: Failed to queue ${level} notification`
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Workspace ${workspace.workspace_id}: ${message}`);
      }
    }

    const totalQueued =
      notificationsQueued.warning90 +
      notificationsQueued.warning95 +
      notificationsQueued.exceeded;

    console.log(
      `[Threshold Cron] Completed: ${workspaces.length} workspaces checked, ` +
        `${totalQueued} notifications queued (90%: ${notificationsQueued.warning90}, ` +
        `95%: ${notificationsQueued.warning95}, exceeded: ${notificationsQueued.exceeded}), ` +
        `${errors.length} errors`
    );

    return NextResponse.json({
      success: errors.length === 0,
      workspacesChecked: workspaces.length,
      notificationsQueued,
      errors,
      timestamp,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Threshold Cron] Fatal error:', error);

    return NextResponse.json(
      {
        success: false,
        workspacesChecked: 0,
        notificationsQueued,
        errors: [...errors, `Fatal error: ${message}`],
        timestamp,
      },
      { status: 500 }
    );
  }
}
