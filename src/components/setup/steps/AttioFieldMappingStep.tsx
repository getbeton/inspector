'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'

interface AttioAttribute {
  id: string
  slug: string
  title: string
  type: string
  isWritable: boolean
}

interface AttioObject {
  id: string
  slug: string
  singularNoun: string
  pluralNoun: string
}

interface FieldMappingEntry {
  betonField: string
  betonLabel: string
  attioAttributeSlug: string | null
}

const BETON_FIELDS: Array<{ field: string; label: string; description: string }> = [
  { field: 'domain', label: 'Domain', description: 'Company website domain' },
  { field: 'health_score', label: 'Health Score', description: 'Account health (0-100)' },
  { field: 'signal_count', label: 'Signal Count', description: 'Total signals detected' },
  { field: 'concrete_grade', label: 'Concrete Grade', description: 'Account grade (M100-M10)' },
  { field: 'last_signal_date', label: 'Last Signal Date', description: 'When last signal was detected' },
]

interface AttioFieldMappingStepProps {
  onSuccess: (mapping: Record<string, string | null>) => void
  className?: string
}

/**
 * Attio field mapping step — maps Beton computed fields to Attio object attributes.
 * Auto-discovers Attio objects and lists their writable attributes.
 */
export function AttioFieldMappingStep({ onSuccess, className }: AttioFieldMappingStepProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [objects, setObjects] = useState<AttioObject[]>([])
  const [selectedObject, setSelectedObject] = useState<string>('companies')
  const [attributes, setAttributes] = useState<AttioAttribute[]>([])
  const [mapping, setMapping] = useState<FieldMappingEntry[]>(
    BETON_FIELDS.map(f => ({
      betonField: f.field,
      betonLabel: f.label,
      attioAttributeSlug: null,
    }))
  )

  // Load Attio objects on mount
  useEffect(() => {
    async function loadObjects() {
      try {
        const res = await fetch('/api/integrations/attio/objects')
        if (!res.ok) throw new Error('Failed to load Attio objects')
        const data = await res.json()
        setObjects(data.objects || [])

        // Auto-select "companies" if available
        const hasCompanies = (data.objects || []).some((o: AttioObject) => o.slug === 'companies')
        if (hasCompanies) {
          setSelectedObject('companies')
        } else if (data.objects?.length > 0) {
          setSelectedObject(data.objects[0].slug)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load Attio objects')
      } finally {
        setIsLoading(false)
      }
    }
    loadObjects()
  }, [])

  // Load attributes when selected object changes
  useEffect(() => {
    if (!selectedObject) return

    async function loadAttributes() {
      try {
        const res = await fetch(`/api/integrations/attio/attributes?object=${encodeURIComponent(selectedObject)}`)
        if (!res.ok) throw new Error('Failed to load attributes')
        const data = await res.json()
        const attrs = (data.attributes || []).filter((a: AttioAttribute) => a.isWritable)
        setAttributes(attrs)

        // Auto-match "domain" field if there's an attribute named "domain" or "website"
        setMapping(prev => prev.map(m => {
          if (m.betonField === 'domain') {
            const domainMatch = attrs.find((a: AttioAttribute) =>
              a.slug === 'domain' || a.slug === 'website' || a.slug === 'domains'
            )
            return { ...m, attioAttributeSlug: domainMatch?.slug || m.attioAttributeSlug }
          }
          return m
        }))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load attributes')
      }
    }
    loadAttributes()
  }, [selectedObject])

  const updateMapping = (betonField: string, attioSlug: string | null) => {
    setMapping(prev => prev.map(m =>
      m.betonField === betonField ? { ...m, attioAttributeSlug: attioSlug } : m
    ))
  }

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)

    try {
      // Convert to a simple record
      const mappingRecord: Record<string, string | null> = {}
      for (const entry of mapping) {
        mappingRecord[entry.betonField] = entry.attioAttributeSlug
      }
      mappingRecord._object = selectedObject

      // Save to integration_configs.field_mapping
      const res = await fetch('/api/integrations/attio/validate', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field_mapping: mappingRecord }),
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
          <span className="ml-2 text-sm text-muted-foreground">Discovering Attio objects...</span>
        </div>
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">Map Attio Fields</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Choose which Attio attributes should receive Beton data. Unmapped fields will be skipped.
          </p>
        </div>

        {/* Object selector */}
        {objects.length > 1 && (
          <div>
            <label className="text-sm font-medium mb-1.5 block">Target Object</label>
            <select
              value={selectedObject}
              onChange={(e) => setSelectedObject(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm"
            >
              {objects.map(obj => (
                <option key={obj.slug} value={obj.slug}>
                  {obj.pluralNoun || obj.slug}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Mapping table */}
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Beton Field</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Attio Attribute</th>
              </tr>
            </thead>
            <tbody>
              {mapping.map((entry) => {
                const fieldInfo = BETON_FIELDS.find(f => f.field === entry.betonField)
                return (
                  <tr key={entry.betonField} className="border-b border-border last:border-0">
                    <td className="px-3 py-3">
                      <div>
                        <p className="font-medium">{entry.betonLabel}</p>
                        <p className="text-xs text-muted-foreground">{fieldInfo?.description}</p>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={entry.attioAttributeSlug || ''}
                        onChange={(e) => updateMapping(entry.betonField, e.target.value || null)}
                        className="w-full px-2 py-1.5 border border-border rounded-md bg-background text-sm"
                      >
                        <option value="">— Skip —</option>
                        {attributes.map(attr => (
                          <option key={attr.slug} value={attr.slug}>
                            {attr.title} ({attr.type})
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
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full"
        >
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
