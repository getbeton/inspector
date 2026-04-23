/**
 * Beton-computed properties available as a source scope in field mappings.
 * These are the values Beton derives internally (health_score, concrete_grade, etc.)
 * that users may want to sync into their CRM alongside raw PostHog data.
 *
 * Used by the SourcePicker to offer "Beton properties" as a third scope
 * (in addition to PostHog person and group properties).
 */
export interface BetonProperty {
  id: string
  label: string
  kind: string
  example?: string | number
  description?: string
}

export const BETON_PROPERTIES: BetonProperty[] = [
  {
    id: 'domain',
    label: 'domain',
    kind: 'domain',
    example: 'acme.io',
    description: 'Company website domain',
  },
  {
    id: 'health_score',
    label: 'health_score',
    kind: 'number',
    example: 87,
    description: 'Account health score (0-100)',
  },
  {
    id: 'signal_count',
    label: 'signal_count',
    kind: 'number',
    example: 14,
    description: 'Total signals detected on this account',
  },
  {
    id: 'concrete_grade',
    label: 'concrete_grade',
    kind: 'text',
    example: 'M100',
    description: 'Concrete grade (M100, M75, M50, M25, M10)',
  },
  {
    id: 'last_signal_date',
    label: 'last_signal_date',
    kind: 'datetime',
    example: '2026-04-01T12:00:00Z',
    description: 'Timestamp of the most recent signal',
  },
  {
    id: 'account_name',
    label: 'account_name',
    kind: 'text',
    example: 'Acme Robotics',
    description: 'Display name of the account',
  },
]
