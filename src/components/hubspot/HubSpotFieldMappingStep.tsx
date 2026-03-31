'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
import { Check, Plus } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HubSpotProperty {
  name: string
  label: string
  type: string
  fieldType: string
  groupName: string
  calculated: boolean
}

interface FieldMappingEntry {
  betonField: string
  betonLabel: string
  hubspotProperty: string | null
}

// ---------------------------------------------------------------------------
// Beton fields for HubSpot mapping
// ---------------------------------------------------------------------------

const BETON_FIELDS: Array<{
  field: string
  label: string
  description: string
  type: string
}> = [
  { field: 'domain', label: 'Domain', description: 'Company website domain', type: 'string' },
  { field: 'health_score', label: 'Health Score', description: 'Account health (0-100)', type: 'number' },
  { field: 'expansion_score', label: 'Expansion Score', description: 'Expansion potential (0-100)', type: 'number' },
  { field: 'churn_risk_score', label: 'Churn Risk Score', description: 'Churn risk (0-100)', type: 'number' },
  { field: 'concrete_grade', label: 'Concrete Grade', description: 'Account grade (M100-M10)', type: 'enumeration' },
  { field: 'signal_count', label: 'Signal Count', description: 'Total signals detected', type: 'number' },
  { field: 'last_signal_date', label: 'Last Signal Date', description: 'When last signal was detected', type: 'datetime' },
  { field: 'last_signal_type', label: 'Last Signal Type', description: 'Type of last signal', type: 'string' },
]

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface HubSpotFieldMappingStepProps {
  connectionId?: string
  onSuccess: (mapping: Record<string, string | null>) => void
  className?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * HubSpot field mapping step -- maps Beton computed fields to HubSpot properties.
 * Auto-discovers HubSpot properties and supports auto-creating beton_* properties.
 */
export function HubSpotFieldMappingStep({
  connectionId,
  onSuccess,
  className,
}: HubSpotFieldMappingStepProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isCreatingProps, setIsCreatingProps] = useState(false)
  const [propsCreated, setPropsCreated] = useState(false)

  const [properties, setProperties] = useState<HubSpotProperty[]>([])
  const [objectType] = useState<string>('companies')
  const [mapping, setMapping] = useState<FieldMappingEntry[]>(
    BETON_FIELDS.map((f) => ({
      betonField: f.field,
      betonLabel: f.label,
      hubspotProperty: null,
    }))
  )

  // Load HubSpot properties on mount
  useEffect(() => {
    async function loadProperties() {
      try {
        const params = new URLSearchParams({ object_type: objectType })
        if (connectionId) params.set('connection_id', connectionId)

        const res = await fetch(`/api/integrations/hubspot/properties?${params}`)
        if (!res.ok) throw new Error('Failed to load HubSpot properties')
        const data = await res.json()

        const props: HubSpotProperty[] = (data.properties || data.results || [])
          .filter((p: HubSpotProperty) => !p.calculated)

        setProperties(props)

        // Auto-match domain -> domain property
        setMapping((prev) =>
          prev.map((m) => {
            if (m.betonField === 'domain') {
              const domainMatch = props.find(
                (p: HubSpotProperty) => p.name === 'domain' || p.name === 'website'
              )
              return { ...m, hubspotProperty: domainMatch?.name || m.hubspotProperty }
            }
            // Auto-match beton_* properties if they exist
            const betonName = `beton_${m.betonField}`
            const betonMatch = props.find((p: HubSpotProperty) => p.name === betonName)
            if (betonMatch) {
              return { ...m, hubspotProperty: betonMatch.name }
            }
            return m
          })
        )

        // Load existing mappings
        try {
          const mappingParams = new URLSearchParams()
          if (connectionId) mappingParams.set('connection_id', connectionId)
          const mapRes = await fetch(`/api/integrations/hubspot/mappings?${mappingParams}`)
          if (mapRes.ok) {
            const mapData = await mapRes.json()
            if (mapData.field_mappings && typeof mapData.field_mappings === 'object') {
              setMapping((prev) =>
                prev.map((m) => {
                  const saved = mapData.field_mappings[m.betonField]
                  if (saved) {
                    return { ...m, hubspotProperty: saved }
                  }
                  return m
                })
              )
            }
          }
        } catch {
          // Non-critical: continue without saved mappings
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load HubSpot properties')
      } finally {
        setIsLoading(false)
      }
    }
    loadProperties()
  }, [objectType, connectionId])

  const updateMapping = (betonField: string, hubspotName: string | null) => {
    setMapping((prev) =>
      prev.map((m) =>
        m.betonField === betonField ? { ...m, hubspotProperty: hubspotName } : m
      )
    )
  }

  /**
   * Auto-create beton_* custom properties in HubSpot.
   */
  const handleCreateBetonProperties = async () => {
    setIsCreatingProps(true)
    setError(null)

    try {
      const res = await fetch('/api/integrations/hubspot/entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          connection_id: connectionId,
          ensure_properties: true,
          // Trigger property creation without creating any entities
          create_company: false,
          create_contact: false,
          create_deal: false,
        }),
      })

      // Regardless of entity creation result, reload properties
      const params = new URLSearchParams({ object_type: objectType })
      if (connectionId) params.set('connection_id', connectionId)
      const propsRes = await fetch(`/api/integrations/hubspot/properties?${params}`)
      if (propsRes.ok) {
        const data = await propsRes.json()
        const props: HubSpotProperty[] = (data.properties || data.results || [])
          .filter((p: HubSpotProperty) => !p.calculated)
        setProperties(props)

        // Auto-map beton_* properties
        setMapping((prev) =>
          prev.map((m) => {
            const betonName = `beton_${m.betonField}`
            const betonMatch = props.find((p) => p.name === betonName)
            if (betonMatch && !m.hubspotProperty) {
              return { ...m, hubspotProperty: betonMatch.name }
            }
            return m
          })
        )
      }

      setPropsCreated(true)

      if (!res.ok) {
        // Properties might still have been created; don't block user
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create properties')
    } finally {
      setIsCreatingProps(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)

    try {
      const mappingRecord: Record<string, string | null> = {}
      for (const entry of mapping) {
        mappingRecord[entry.betonField] = entry.hubspotProperty
      }
      mappingRecord._object = objectType

      const res = await fetch('/api/integrations/hubspot/mappings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          connection_id: connectionId,
          field_mappings: mappingRecord,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Failed to save field mapping')
      }

      onSuccess(mappingRecord)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className={className}>
        <div className="flex items-center justify-center py-8">
          <Spinner className="size-6" />
          <span className="ml-2 text-sm text-muted-foreground">
            Loading HubSpot properties...
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">Map HubSpot Fields</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Choose which HubSpot properties should receive Beton data.
            Unmapped fields will be skipped.
          </p>
        </div>

        {/* Create in HubSpot button */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCreateBetonProperties}
            disabled={isCreatingProps || propsCreated}
          >
            {isCreatingProps ? (
              <>
                <Spinner className="h-3 w-3" />
                Creating...
              </>
            ) : propsCreated ? (
              <>
                <Check className="h-3 w-3" />
                Properties Created
              </>
            ) : (
              <>
                <Plus className="h-3 w-3" />
                Create beton_* in HubSpot
              </>
            )}
          </Button>
          <span className="text-xs text-muted-foreground">
            Auto-creates Beton custom properties on {objectType}
          </span>
        </div>

        {/* Mapping table */}
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                  Beton Field
                </th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                  HubSpot Property
                </th>
              </tr>
            </thead>
            <tbody>
              {mapping.map((entry) => {
                const fieldInfo = BETON_FIELDS.find((f) => f.field === entry.betonField)
                return (
                  <tr
                    key={entry.betonField}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-3 py-3">
                      <div>
                        <p className="font-medium">{entry.betonLabel}</p>
                        <p className="text-xs text-muted-foreground">
                          {fieldInfo?.description}
                        </p>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={entry.hubspotProperty || ''}
                        onChange={(e) =>
                          updateMapping(entry.betonField, e.target.value || null)
                        }
                        className="w-full px-2 py-1.5 border border-border rounded-md bg-background text-sm"
                      >
                        <option value="">-- Skip --</option>
                        {properties.map((prop) => (
                          <option key={prop.name} value={prop.name}>
                            {prop.label} ({prop.type})
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {error && (
          <Alert variant="error">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button onClick={handleSave} disabled={isSaving} className="w-full">
          {isSaving ? 'Saving...' : 'Save Field Mapping'}
        </Button>

        <button
          type="button"
          onClick={() => onSuccess({})}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip for now
        </button>
      </div>
    </div>
  )
}
