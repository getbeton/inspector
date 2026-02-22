/**
 * Validate a field value against its Attio attribute type.
 *
 * Returns a human-readable error message, or null if the value is valid.
 * Skips validation when:
 *   - The value is empty (nothing to validate yet)
 *   - The value contains `{{` (template variable — resolved at runtime)
 */
export function validateFieldValue(
  value: string,
  type: string
): string | null {
  // Empty or template variable → always valid at mapping time
  if (!value || value.includes("{{")) return null

  switch (type) {
    case "number":
      return isNaN(Number(value)) ? "Expected a number" : null

    case "currency":
      return isNaN(Number(value)) ? "Expected a currency amount" : null

    case "date": {
      // Must match YYYY-MM-DD and parse to a valid date
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return "Expected a date (YYYY-MM-DD)"
      }
      const d = new Date(value + "T00:00:00")
      return isNaN(d.getTime()) ? "Expected a date (YYYY-MM-DD)" : null
    }

    case "checkbox":
      return value === "true" || value === "false"
        ? null
        : 'Expected "true" or "false"'

    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        ? null
        : "Expected a valid email address"

    case "url":
      try {
        new URL(value)
        return null
      } catch {
        return "Expected a valid URL (e.g., https://...)"
      }

    case "phone":
      // Allow digits, spaces, dashes, parentheses, plus sign; min 7 chars
      return /^[0-9\s\-()+ ]{7,}$/.test(value)
        ? null
        : "Expected a phone number"

    // text, select, status — no validation needed
    default:
      return null
  }
}
