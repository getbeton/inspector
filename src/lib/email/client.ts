/**
 * seqd Transactional Email Client
 *
 * HTTP client for Beton's own email sequencer (seqd) which sends via Gmail API.
 * Used for workspace invitations, domain auto-join notifications, and other
 * transactional emails.
 *
 * Config:
 * - SEQD_API_URL: Base URL of seqd instance (e.g., https://seqd.yourdomain.com)
 * - SEQD_API_KEY: API key for authentication
 */

// ============================================
// Types
// ============================================

export interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
}

export interface SendEmailResult {
  messageId: string;
  threadId: string;
}

export interface SendWorkspaceInviteParams {
  to: string;
  workspaceName: string;
  inviterName: string;
  role: string;
  acceptUrl: string;
}

export interface SendDomainJoinNotificationParams {
  to: string;
  workspaceName: string;
  joinerName: string;
  joinerEmail: string;
}

// ============================================
// Shared HTML Helpers
// ============================================

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const BETON_BLUE = '#4A90E2';

function emailWrapper(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: ${FONT_STACK}; line-height: 1.6; color: #333;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background: #ffffff; border-radius: 8px; overflow: hidden;">
          ${content}
          <!-- Footer -->
          <tr>
            <td style="padding: 24px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #e0e0e0;">
              <p style="margin: 0;">&copy; ${new Date().getFullYear()} Beton Inspector</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function ctaButton(text: string, url: string): string {
  return `<div style="text-align: center; margin: 32px 0;">
  <a href="${url}"
     style="display: inline-block; background-color: ${BETON_BLUE}; color: #ffffff;
            padding: 14px 32px; text-decoration: none; border-radius: 6px;
            font-weight: 600; font-size: 16px; font-family: ${FONT_STACK};">
    ${text}
  </a>
</div>`;
}

// ============================================
// Core Send Function
// ============================================

/**
 * Sends a transactional email via seqd.
 *
 * POSTs to the seqd transactional send endpoint. If SEQD_API_URL is not
 * configured, logs a warning and returns silently (graceful degradation
 * for dev environments).
 */
export async function sendEmail(
  params: SendEmailParams
): Promise<SendEmailResult | undefined> {
  const seqdUrl = process.env.SEQD_API_URL;
  const seqdKey = process.env.SEQD_API_KEY;

  if (!seqdUrl) {
    console.warn(
      '[Email Client] SEQD_API_URL not configured — skipping email send.',
      { to: params.to, subject: params.subject }
    );
    return undefined;
  }

  const endpoint = `${seqdUrl.replace(/\/+$/, '')}/api/transactional/send`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'x-api-key': seqdKey || '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: params.to,
      subject: params.subject,
      body: params.body,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(
      `[Email Client] seqd API error ${response.status}: ${errorBody}`
    );
  }

  const result = await response.json();

  console.log(
    `[Email Client] Sent email to ${params.to} — messageId=${result.messageId}`
  );

  return {
    messageId: result.messageId,
    threadId: result.threadId,
  };
}

// ============================================
// Workspace Invite Email
// ============================================

/**
 * Sends a workspace invitation email.
 *
 * Formats a clean HTML email with invite details and a prominent
 * "Accept Invite" button, then delegates to sendEmail().
 */
export async function sendWorkspaceInvite(
  params: SendWorkspaceInviteParams
): Promise<SendEmailResult | undefined> {
  const { to, workspaceName, inviterName, role, acceptUrl } = params;

  const subject = `You've been invited to join ${workspaceName} on Beton`;

  const body = emailWrapper(`
    <!-- Header -->
    <tr>
      <td style="background-color: ${BETON_BLUE}; padding: 32px 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 600; font-family: ${FONT_STACK};">
          You're Invited
        </h1>
      </td>
    </tr>
    <!-- Content -->
    <tr>
      <td style="padding: 32px 24px;">
        <p style="margin: 0 0 16px; font-size: 16px;">
          <strong>${inviterName}</strong> has invited you to join
          <strong>${workspaceName}</strong> on Beton Inspector as
          ${role === 'admin' ? 'an' : 'a'} <strong>${role}</strong>.
        </p>
        <p style="margin: 0 0 8px; font-size: 15px; color: #555;">
          Beton Inspector helps your team detect product-qualified leads,
          monitor account health, and route signals to your CRM.
        </p>
        ${ctaButton('Accept Invite', acceptUrl)}
        <p style="margin: 0; font-size: 13px; color: #999; text-align: center;">
          If you weren't expecting this invitation, you can safely ignore this email.
        </p>
      </td>
    </tr>
  `);

  return sendEmail({ to, subject, body });
}

// ============================================
// Domain Auto-Join Notification
// ============================================

/**
 * Notifies a workspace owner when someone joins via domain auto-join.
 */
export async function sendDomainJoinNotification(
  params: SendDomainJoinNotificationParams
): Promise<SendEmailResult | undefined> {
  const { to, workspaceName, joinerName, joinerEmail } = params;

  const subject = `${joinerName} joined ${workspaceName}`;

  const body = emailWrapper(`
    <!-- Header -->
    <tr>
      <td style="background-color: ${BETON_BLUE}; padding: 32px 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 600; font-family: ${FONT_STACK};">
          New Team Member
        </h1>
      </td>
    </tr>
    <!-- Content -->
    <tr>
      <td style="padding: 32px 24px;">
        <p style="margin: 0 0 16px; font-size: 16px;">
          <strong>${joinerName}</strong> (${joinerEmail}) has joined
          <strong>${workspaceName}</strong> via domain auto-join.
        </p>
        <p style="margin: 0; font-size: 15px; color: #555;">
          They now have access to your workspace. You can manage their role
          and permissions from the workspace settings.
        </p>
      </td>
    </tr>
  `);

  return sendEmail({ to, subject, body });
}
