/**
 * Integration Credentials Validation
 *
 * Provides format validation for integration API keys and credentials.
 * This catches obvious format errors before making network requests,
 * improving user experience and reducing unnecessary API calls.
 */

// ============================================
// Validation Result Types
// ============================================

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// ============================================
// PostHog Validation
// ============================================

/**
 * PostHog API key prefixes:
 * - phx_ : Personal API key (for API access)
 * - phc_ : Project API key (for client SDK)
 *
 * For server-side API access, we need phx_ keys.
 */
const POSTHOG_API_KEY_PREFIXES = ['phx_', 'phc_'];

/**
 * Validates a PostHog API key format.
 *
 * @param apiKey - The API key to validate
 * @returns Validation result with error message if invalid
 */
export function validatePostHogApiKey(apiKey: string): ValidationResult {
  if (!apiKey || typeof apiKey !== 'string') {
    return {
      valid: false,
      error: 'API key is required',
    };
  }

  const trimmed = apiKey.trim();

  if (trimmed.length === 0) {
    return {
      valid: false,
      error: 'API key cannot be empty',
    };
  }

  // Check for valid prefix
  const hasValidPrefix = POSTHOG_API_KEY_PREFIXES.some((prefix) =>
    trimmed.startsWith(prefix)
  );

  if (!hasValidPrefix) {
    return {
      valid: false,
      error: `PostHog API key must start with ${POSTHOG_API_KEY_PREFIXES.join(' or ')}`,
    };
  }

  // Check minimum length (prefix + at least some characters)
  if (trimmed.length < 10) {
    return {
      valid: false,
      error: 'PostHog API key appears too short',
    };
  }

  return { valid: true };
}

/**
 * Validates a PostHog project ID.
 * Project IDs are numeric strings.
 *
 * @param projectId - The project ID to validate
 * @returns Validation result with error message if invalid
 */
export function validatePostHogProjectId(projectId: string): ValidationResult {
  if (!projectId || typeof projectId !== 'string') {
    return {
      valid: false,
      error: 'Project ID is required',
    };
  }

  const trimmed = projectId.trim();

  if (trimmed.length === 0) {
    return {
      valid: false,
      error: 'Project ID cannot be empty',
    };
  }

  // Project IDs should be numeric
  if (!/^\d+$/.test(trimmed)) {
    return {
      valid: false,
      error: 'Project ID must be numeric (e.g., "12345")',
    };
  }

  return { valid: true };
}

/**
 * Validates a PostHog region.
 * Valid regions are 'us' and 'eu'.
 *
 * @param region - The region to validate
 * @returns Validation result with error message if invalid
 */
export function validatePostHogRegion(region: string | undefined): ValidationResult {
  // Region is optional, defaults to 'us'
  if (!region) {
    return { valid: true };
  }

  const validRegions = ['us', 'eu'];
  const normalized = region.toLowerCase().trim();

  if (!validRegions.includes(normalized)) {
    return {
      valid: false,
      error: `Region must be "us" or "eu", got "${region}"`,
    };
  }

  return { valid: true };
}

/**
 * Validates all PostHog credentials together.
 *
 * @param credentials - Object containing apiKey, projectId, and optional region
 * @returns Validation result with combined error message if invalid
 */
export function validatePostHogCredentials(credentials: {
  apiKey: string;
  projectId: string;
  region?: string;
}): ValidationResult {
  const errors: string[] = [];

  const apiKeyResult = validatePostHogApiKey(credentials.apiKey);
  if (!apiKeyResult.valid && apiKeyResult.error) {
    errors.push(apiKeyResult.error);
  }

  const projectIdResult = validatePostHogProjectId(credentials.projectId);
  if (!projectIdResult.valid && projectIdResult.error) {
    errors.push(projectIdResult.error);
  }

  const regionResult = validatePostHogRegion(credentials.region);
  if (!regionResult.valid && regionResult.error) {
    errors.push(regionResult.error);
  }

  if (errors.length > 0) {
    return {
      valid: false,
      error: errors.join('. '),
    };
  }

  return { valid: true };
}

// ============================================
// Attio Validation
// ============================================

/**
 * Validates an Attio API key format.
 *
 * @param apiKey - The API key to validate
 * @returns Validation result with error message if invalid
 */
export function validateAttioApiKey(apiKey: string): ValidationResult {
  if (!apiKey || typeof apiKey !== 'string') {
    return {
      valid: false,
      error: 'API key is required',
    };
  }

  const trimmed = apiKey.trim();

  if (trimmed.length === 0) {
    return {
      valid: false,
      error: 'API key cannot be empty',
    };
  }

  // Check minimum length
  if (trimmed.length < 15) {
    return {
      valid: false,
      error: 'Attio API key appears too short',
    };
  }

  return { valid: true };
}

// ============================================
// Generic Helpers
// ============================================

/**
 * Checks if a string looks like a potentially valid API key.
 * This is a loose check that just verifies basic format.
 *
 * @param value - The string to check
 * @returns true if it looks like an API key (has length and no spaces)
 */
export function looksLikeApiKey(value: string): boolean {
  if (!value || typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();

  // API keys typically:
  // - Have reasonable length (at least 10 chars)
  // - Don't contain spaces
  // - Are alphanumeric with underscores/hyphens
  return (
    trimmed.length >= 10 &&
    !trimmed.includes(' ') &&
    /^[a-zA-Z0-9_\-]+$/.test(trimmed)
  );
}
