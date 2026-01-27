/**
 * Next.js Instrumentation
 *
 * This file runs once when the Next.js server starts.
 * Use it for startup validation and initialization.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

import { isCloudDeployment } from '@/lib/utils/deployment';

/**
 * Validates required environment variables for cloud deployment mode.
 * In self-hosted mode, these checks are optional.
 *
 * Accepts encryption helpers as parameters to avoid top-level imports
 * of Node.js built-ins (crypto/util) that break the Edge runtime.
 */
function validateCloudModeEnvironment(
  isEncryptionKeyConfigured: () => boolean
): void {
  const errors: string[] = [];

  // Validate ENCRYPTION_KEY is properly configured
  if (!isEncryptionKeyConfigured()) {
    errors.push(
      'ENCRYPTION_KEY: Missing or invalid. Required for encrypting integration credentials.'
    );
  }

  // In cloud mode, these Stripe variables are required
  const requiredStripeVars = [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
  ];

  for (const varName of requiredStripeVars) {
    if (!process.env[varName]) {
      errors.push(`${varName}: Missing. Required for billing in cloud mode.`);
    }
  }

  // Log warnings for recommended but not required variables
  const recommendedVars = ['STRIPE_PRICE_ID', 'STRIPE_BILLING_METER_ID'];
  for (const varName of recommendedVars) {
    if (!process.env[varName]) {
      console.warn(
        `[Instrumentation] Warning: ${varName} not set. Some billing features may not work.`
      );
    }
  }

  // If there are errors, fail fast with clear message
  if (errors.length > 0) {
    const errorMessage = [
      '='.repeat(60),
      'STARTUP VALIDATION FAILED',
      '='.repeat(60),
      '',
      'The following required environment variables are missing or invalid:',
      '',
      ...errors.map((e) => `  - ${e}`),
      '',
      'For cloud deployment, ensure all required variables are set in Vercel.',
      'See docs/billing-setup.md for configuration instructions.',
      '',
      '='.repeat(60),
    ].join('\n');

    console.error(errorMessage);
    throw new Error(`Startup validation failed: ${errors.length} error(s). Check logs for details.`);
  }
}

/**
 * Validates environment on startup.
 * In self-hosted mode, validates ENCRYPTION_KEY if set.
 * In cloud mode, validates all required billing environment variables.
 *
 * Accepts encryption helpers as parameters to avoid top-level imports
 * of Node.js built-ins (crypto/util) that break the Edge runtime.
 */
function validateEnvironment(
  encryptionHelpers: {
    validateEncryptionKey: () => void;
    isEncryptionKeyConfigured: () => boolean;
  }
): void {
  const mode = isCloudDeployment() ? 'cloud' : 'self-hosted';
  console.log(`[Instrumentation] Starting in ${mode} mode`);

  if (isCloudDeployment()) {
    // Cloud mode: strict validation of all required env vars
    validateCloudModeEnvironment(encryptionHelpers.isEncryptionKeyConfigured);
    console.log('[Instrumentation] Cloud mode environment validated successfully');
  } else {
    // Self-hosted mode: validate ENCRYPTION_KEY if set (optional but must be valid if present)
    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (encryptionKey) {
      try {
        encryptionHelpers.validateEncryptionKey();
        console.log('[Instrumentation] ENCRYPTION_KEY validated successfully');
      } catch (error) {
        console.error(
          '[Instrumentation] Invalid ENCRYPTION_KEY:',
          error instanceof Error ? error.message : error
        );
        throw error;
      }
    } else {
      console.log(
        '[Instrumentation] ENCRYPTION_KEY not set (self-hosted mode). ' +
        'Integration credentials will be stored in plaintext.'
      );
    }
  }
}

/**
 * Called by Next.js when the server starts.
 * This runs once during server startup (not during build).
 */
export async function register(): Promise<void> {
  // Only run validation on the server (not during build or in the browser)
  if (typeof window !== 'undefined') {
    return;
  }

  // Skip validation during build phase
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    console.log('[Instrumentation] Skipping validation during build phase');
    return;
  }

  try {
    // Dynamic import: defers resolution of Node.js built-ins (crypto/util)
    // to runtime, where register() only runs in the Node.js runtime.
    // A static import here would break the Edge runtime evaluation.
    const { validateEncryptionKey, isEncryptionKeyConfigured } = await import(
      '@/lib/crypto/encryption'
    );

    validateEnvironment({ validateEncryptionKey, isEncryptionKeyConfigured });
  } catch (error) {
    // In development, log the error but don't crash
    if (process.env.NODE_ENV === 'development') {
      console.error('[Instrumentation] Startup validation failed:', error);
      console.warn('[Instrumentation] Continuing in development mode despite validation errors');
      return;
    }

    // In production, re-throw to prevent startup with invalid config
    throw error;
  }
}
