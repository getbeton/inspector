/**
 * Email Module
 *
 * Handles all email sending functionality for Beton Inspector.
 * Uses Resend for email delivery.
 */

export {
  sendThresholdNotification,
  sendBatchNotifications,
  type NotificationEmailParams,
  type EmailResult,
} from './notification-service';
