/**
 * Public email domains — these don't indicate a company website.
 * Used for:
 * - Auth callback: skip auto-detecting website_url for public domains
 * - Workspace domains: prevent claiming generic email providers
 */
export const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com',
  'live.com', 'yahoo.com', 'aol.com', 'icloud.com', 'me.com',
  'protonmail.com', 'proton.me', 'zoho.com', 'mail.com',
  'yandex.com', 'fastmail.com', 'tutanota.com',
])
