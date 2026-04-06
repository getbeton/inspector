/**
 * Email Module
 *
 * Handles all email sending functionality for Beton Inspector.
 * - Billing notifications: Resend (notification-service)
 * - Transactional emails: seqd (client)
 */

export {
  sendThresholdNotification,
  sendBatchNotifications,
  type NotificationEmailParams,
  type EmailResult,
} from './notification-service';

export {
  sendEmail,
  sendWorkspaceInvite,
  sendDomainJoinNotification,
  type SendEmailParams,
  type SendEmailResult,
  type SendWorkspaceInviteParams,
  type SendDomainJoinNotificationParams,
} from './client';
