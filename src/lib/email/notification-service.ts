/**
 * Email Notification Service
 *
 * Handles sending threshold notification emails to workspace admins.
 * Uses Resend for email delivery with fallback to console logging.
 *
 * Email types:
 * - 90% threshold warning
 * - 95% threshold urgent warning
 * - 100%+ threshold exceeded (access blocked)
 */

import { isBillingEnabled } from '@/lib/utils/deployment';

// ============================================
// Types
// ============================================

export interface NotificationEmailParams {
  workspaceId: string;
  workspaceName: string;
  recipientEmails: string[];
  notificationLevel: 'warning_90' | 'warning_95' | 'exceeded';
  mtuCount: number;
  threshold: number;
  settingsUrl?: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// ============================================
// Configuration
// ============================================

const EMAIL_CONFIG = {
  from: process.env.RESEND_FROM_EMAIL || 'Beton Inspector <noreply@betoninspector.com>',
  replyTo: process.env.RESEND_REPLY_TO || 'support@betoninspector.com',
};

// ============================================
// Email Templates
// ============================================

/**
 * Gets the email subject based on notification level.
 */
function getEmailSubject(
  level: NotificationEmailParams['notificationLevel'],
  workspaceName: string
): string {
  switch (level) {
    case 'warning_90':
      return `[${workspaceName}] You've used 90% of your free tier`;
    case 'warning_95':
      return `[${workspaceName}] Urgent: 95% of free tier used`;
    case 'exceeded':
      return `[${workspaceName}] Free tier limit exceeded - Action required`;
    default:
      return `[${workspaceName}] Billing notification`;
  }
}

/**
 * Gets the email HTML content based on notification level.
 */
function getEmailHtml(params: NotificationEmailParams): string {
  const {
    workspaceName,
    notificationLevel,
    mtuCount,
    threshold,
    settingsUrl = 'https://app.betoninspector.com/settings',
  } = params;

  const percentUsed = Math.round((mtuCount / threshold) * 100);
  const remaining = Math.max(0, threshold - mtuCount);

  const baseStyles = `
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.6;
    color: #333;
  `;

  let headerColor: string;
  let headerText: string;
  let mainMessage: string;
  let ctaText: string;

  switch (notificationLevel) {
    case 'warning_90':
      headerColor = '#FB8C00'; // Warning orange
      headerText = '90% of Free Tier Used';
      mainMessage = `
        <p>Your workspace <strong>${workspaceName}</strong> has used ${mtuCount} of your ${threshold} monthly tracked users (MTU) limit.</p>
        <p>You have approximately <strong>${remaining} MTUs remaining</strong> this billing cycle.</p>
        <p>To avoid interruption to your service, we recommend adding a payment method to your account. You'll only be charged for usage above the free tier.</p>
      `;
      ctaText = 'Add Payment Method';
      break;

    case 'warning_95':
      headerColor = '#E53935'; // Danger red
      headerText = '95% of Free Tier Used - Urgent';
      mainMessage = `
        <p>Your workspace <strong>${workspaceName}</strong> has used ${mtuCount} of your ${threshold} monthly tracked users (MTU) limit.</p>
        <p>You have only <strong>${remaining} MTUs remaining</strong> this billing cycle.</p>
        <p><strong>Action required:</strong> Please add a payment method to continue using Beton Inspector without interruption.</p>
      `;
      ctaText = 'Add Payment Method Now';
      break;

    case 'exceeded':
      headerColor = '#E53935'; // Danger red
      headerText = 'Free Tier Limit Exceeded';
      mainMessage = `
        <p>Your workspace <strong>${workspaceName}</strong> has exceeded the free tier limit of ${threshold} monthly tracked users (MTU).</p>
        <p>Current usage: <strong>${mtuCount} MTUs (${percentUsed}%)</strong></p>
        <p><strong>Your access has been restricted.</strong> To restore full access, please add a payment method to your account.</p>
        <p>With a payment method on file, you'll only be charged for usage above the free tier, and your access will be immediately restored.</p>
      `;
      ctaText = 'Restore Access Now';
      break;

    default:
      headerColor = '#4A90E2';
      headerText = 'Billing Notification';
      mainMessage = `<p>You have used ${mtuCount} of ${threshold} MTUs.</p>`;
      ctaText = 'View Settings';
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="${baseStyles} margin: 0; padding: 0; background-color: #f5f5f5;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background: white;">
        <!-- Header -->
        <tr>
          <td style="background-color: ${headerColor}; padding: 24px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 600;">
              ${headerText}
            </h1>
          </td>
        </tr>

        <!-- Content -->
        <tr>
          <td style="padding: 32px 24px;">
            ${mainMessage}

            <!-- Progress Bar -->
            <div style="margin: 24px 0; background-color: #e0e0e0; border-radius: 8px; overflow: hidden;">
              <div style="height: 8px; background-color: ${headerColor}; width: ${Math.min(100, percentUsed)}%;"></div>
            </div>
            <p style="text-align: center; color: #666; font-size: 14px;">
              ${mtuCount} / ${threshold} MTUs used (${percentUsed}%)
            </p>

            <!-- CTA Button -->
            <div style="text-align: center; margin: 32px 0;">
              <a href="${settingsUrl}"
                 style="display: inline-block; background-color: ${headerColor}; color: white;
                        padding: 14px 28px; text-decoration: none; border-radius: 6px;
                        font-weight: 600; font-size: 16px;">
                ${ctaText}
              </a>
            </div>

            <!-- FAQ Section -->
            <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e0e0e0;">
              <h3 style="margin: 0 0 12px; font-size: 16px;">What is an MTU?</h3>
              <p style="margin: 0; color: #666; font-size: 14px;">
                MTU (Monthly Tracked User) is a unique user tracked across all your connected data sources
                during a billing cycle. Each unique user counts as one MTU regardless of how many events they generate.
              </p>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background-color: #f5f5f5; padding: 24px; text-align: center; font-size: 12px; color: #666;">
            <p style="margin: 0 0 8px;">
              <a href="${settingsUrl}" style="color: #4A90E2; text-decoration: none;">Settings</a> &middot;
              <a href="https://betoninspector.com/docs/billing" style="color: #4A90E2; text-decoration: none;">Billing FAQ</a>
            </p>
            <p style="margin: 0;">
              You're receiving this because you're an admin of ${workspaceName}.<br>
              &copy; ${new Date().getFullYear()} Beton Inspector
            </p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

/**
 * Gets plain text version of the email.
 */
function getEmailText(params: NotificationEmailParams): string {
  const {
    workspaceName,
    notificationLevel,
    mtuCount,
    threshold,
    settingsUrl = 'https://app.betoninspector.com/settings',
  } = params;

  const percentUsed = Math.round((mtuCount / threshold) * 100);
  const remaining = Math.max(0, threshold - mtuCount);

  let header: string;
  let message: string;

  switch (notificationLevel) {
    case 'warning_90':
      header = '90% of Free Tier Used';
      message = `Your workspace "${workspaceName}" has used ${mtuCount} of your ${threshold} monthly tracked users (MTU) limit.

You have approximately ${remaining} MTUs remaining this billing cycle.

To avoid interruption to your service, we recommend adding a payment method to your account.`;
      break;

    case 'warning_95':
      header = '95% of Free Tier Used - Urgent';
      message = `Your workspace "${workspaceName}" has used ${mtuCount} of your ${threshold} monthly tracked users (MTU) limit.

You have only ${remaining} MTUs remaining this billing cycle.

ACTION REQUIRED: Please add a payment method to continue using Beton Inspector without interruption.`;
      break;

    case 'exceeded':
      header = 'Free Tier Limit Exceeded';
      message = `Your workspace "${workspaceName}" has exceeded the free tier limit of ${threshold} monthly tracked users (MTU).

Current usage: ${mtuCount} MTUs (${percentUsed}%)

YOUR ACCESS HAS BEEN RESTRICTED. To restore full access, please add a payment method to your account.`;
      break;

    default:
      header = 'Billing Notification';
      message = `You have used ${mtuCount} of ${threshold} MTUs.`;
  }

  return `${header}

${message}

Add a payment method: ${settingsUrl}

---
You're receiving this because you're an admin of ${workspaceName}.
`;
}

// ============================================
// Email Sending
// ============================================

/**
 * Sends a threshold notification email.
 *
 * In production with Resend configured, sends actual emails.
 * Otherwise, logs the email to console for development.
 */
export async function sendThresholdNotification(
  params: NotificationEmailParams
): Promise<EmailResult> {
  // Skip if billing is disabled
  if (!isBillingEnabled()) {
    return { success: true, messageId: 'billing-disabled' };
  }

  const { recipientEmails, notificationLevel, workspaceName } = params;

  // Validate inputs
  if (!recipientEmails || recipientEmails.length === 0) {
    return { success: false, error: 'No recipient emails provided' };
  }

  const subject = getEmailSubject(notificationLevel, workspaceName);
  const html = getEmailHtml(params);
  const text = getEmailText(params);

  // Check if Resend is configured
  const resendApiKey = process.env.RESEND_API_KEY;

  if (resendApiKey) {
    // Send with Resend
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: EMAIL_CONFIG.from,
          to: recipientEmails,
          subject,
          html,
          text,
          reply_to: EMAIL_CONFIG.replyTo,
          tags: [
            { name: 'notification_level', value: notificationLevel },
            { name: 'workspace_id', value: params.workspaceId },
          ],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[Email Service] Resend error:', errorData);
        return {
          success: false,
          error: `Resend API error: ${response.status}`,
        };
      }

      const result = await response.json();
      console.log(
        `[Email Service] Sent ${notificationLevel} notification to ${recipientEmails.join(', ')}`
      );

      return {
        success: true,
        messageId: result.id,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Email Service] Failed to send email:', error);
      return {
        success: false,
        error: message,
      };
    }
  } else {
    // Development mode - log email instead
    console.log('[Email Service] Would send email (Resend not configured):');
    console.log(`  To: ${recipientEmails.join(', ')}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Level: ${notificationLevel}`);
    console.log(`  MTU: ${params.mtuCount}/${params.threshold}`);

    return {
      success: true,
      messageId: `dev-${Date.now()}`,
    };
  }
}

// ============================================
// Batch Sending
// ============================================

/**
 * Sends multiple notification emails in batch.
 * Returns results for each email.
 */
export async function sendBatchNotifications(
  notifications: NotificationEmailParams[]
): Promise<Map<string, EmailResult>> {
  const results = new Map<string, EmailResult>();

  for (const notification of notifications) {
    const result = await sendThresholdNotification(notification);
    results.set(notification.workspaceId, result);

    // Small delay between emails to avoid rate limits
    if (notifications.length > 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return results;
}
