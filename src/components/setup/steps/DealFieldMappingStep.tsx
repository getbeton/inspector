"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Spinner } from "@/components/ui/spinner"
import { TemplateInput, BETON_VARIABLES } from "../fields/TemplateInput"
import { DealFieldRow } from "../fields/DealFieldRow"
import { CreateFieldDialog } from "../fields/CreateFieldDialog"
import type { ComboboxOption } from "@/components/ui/combobox"
import { Plus, AlertCircle, FileText } from "lucide-react"

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

interface FieldMapping {
  id: string
  attioAttributeSlug: string | null
  attioObjectSlug: string
  attioAttributeTitle: string
  attioAttributeType: string
  valueTemplate: string
  isNew: boolean
}

export interface DealMappingState {
  dealNameTemplate: string
  fieldMappings: FieldMapping[]
}

export interface DealFieldMappingStepProps {
  onSuccess: (mapping: DealMappingState) => void
  /** Live callback for real-time preview updates */
  onMappingChange?: (mapping: DealMappingState) => void
  className?: string
}

/**
 * Sample data returned by /api/integrations/attio/sample-data.
 * Used for the live preview on the right panel.
 */
export interface SampleData {
  company_name: string
  company_domain: string
  signal_name: string
  signal_type: string
  health_score: number
  concrete_grade: string
  signal_count: number
  deal_value: number
  detected_at: string
}

let nextId = 0
function genId() {
  return `field_${++nextId}_${Date.now()}`
}

/**
 * Deal-focused field mapping step — replaces the old AttioFieldMappingStep.
 *
 * Users configure how Beton creates deals in Attio:
 * - Deal name template (e.g., "{{company_name}} — {{signal_name}}")
 * - Dynamic field mapping rows: Attio field → value template
 * - Fields grouped from ALL Attio objects (deals, companies, people)
 * - Inline "Create new field" dialog
 *
 * Returns both config (left panel) and preview data for CrmCardPreview (right panel).
 */
export function DealFieldMappingStep({ onSuccess, onMappingChange, className }: DealFieldMappingStepProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Attio schema
  const [objects, setObjects] = useState<AttioObject[]>([])
  const [attributesByObject, setAttributesByObject] = useState<Record<string, AttioAttribute[]>>({})
  const [hasDealObject, setHasDealObject] = useState(true)
  const [primaryObject, setPrimaryObject] = useState("deals")

  // Mapping state
  const [dealNameTemplate, setDealNameTemplate] = useState("{{company_name}} — {{signal_name}}")
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([])

  // Create field dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  // Notify parent of mapping changes for live preview
  useEffect(() => {
    onMappingChange?.({ dealNameTemplate, fieldMappings })
  }, [dealNameTemplate, fieldMappings, onMappingChange])

  // Load Attio objects and attributes on mount
  useEffect(() => {
    async function loadSchema() {
      try {
        // 1. Fetch objects
        const objRes = await fetch("/api/integrations/attio/objects")
        if (!objRes.ok) throw new Error("Failed to load Attio objects")
        const objData = await objRes.json()
        const objs: AttioObject[] = objData.objects || []
        setObjects(objs)

        // Check if deals object exists
        const dealsObj = objs.find((o) => o.slug === "deals")
        if (!dealsObj) {
          setHasDealObject(false)
          // Fall back to companies
          const companiesObj = objs.find((o) => o.slug === "companies")
          setPrimaryObject(companiesObj?.slug || objs[0]?.slug || "companies")
        }

        // 2. Fetch attributes for key objects in parallel
        const objectSlugs = ["deals", "companies", "people"].filter((slug) =>
          objs.some((o) => o.slug === slug)
        )

        const attrResults = await Promise.allSettled(
          objectSlugs.map(async (slug) => {
            const res = await fetch(
              `/api/integrations/attio/attributes?object=${encodeURIComponent(slug)}`
            )
            if (!res.ok) return { slug, attributes: [] }
            const data = await res.json()
            return {
              slug,
              attributes: (data.attributes || []).filter(
                (a: AttioAttribute) => a.isWritable
              ),
            }
          })
        )

        const attrMap: Record<string, AttioAttribute[]> = {}
        for (const result of attrResults) {
          if (result.status === "fulfilled") {
            attrMap[result.value.slug] = result.value.attributes
          }
        }
        setAttributesByObject(attrMap)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load Attio schema")
      } finally {
        setIsLoading(false)
      }
    }
    loadSchema()
  }, [])

  // Build grouped combobox options from all objects' attributes
  const comboboxOptions: ComboboxOption[] = useMemo(() => {
    const opts: ComboboxOption[] = []
    // Order: deals first, then companies, then people, then any custom
    const orderedSlugs = ["deals", "companies", "people"]
    const allSlugs = [
      ...orderedSlugs.filter((s) => s in attributesByObject),
      ...Object.keys(attributesByObject).filter((s) => !orderedSlugs.includes(s)),
    ]

    for (const objSlug of allSlugs) {
      const attrs = attributesByObject[objSlug] || []
      const objInfo = objects.find((o) => o.slug === objSlug)
      const groupLabel = objInfo?.singularNoun
        ? objInfo.singularNoun.charAt(0).toUpperCase() + objInfo.singularNoun.slice(1)
        : objSlug.charAt(0).toUpperCase() + objSlug.slice(1)

      for (const attr of attrs) {
        opts.push({
          value: `${objSlug}::${attr.slug}`,
          label: `${attr.title}`,
          group: groupLabel,
          type: attr.type,
        })
      }
    }
    return opts
  }, [attributesByObject, objects])

  // Add a new empty mapping row
  const addMapping = useCallback(() => {
    setFieldMappings((prev) => [
      ...prev,
      {
        id: genId(),
        attioAttributeSlug: null,
        attioObjectSlug: "",
        attioAttributeTitle: "",
        attioAttributeType: "text",
        valueTemplate: "",
        isNew: false,
      },
    ])
  }, [])

  // Update a mapping row's attribute selection
  const updateMappingAttribute = useCallback(
    (id: string, slug: string | null, objectSlug: string, title: string, type: string) => {
      setFieldMappings((prev) =>
        prev.map((m) =>
          m.id === id
            ? {
                ...m,
                attioAttributeSlug: slug,
                attioObjectSlug: objectSlug,
                attioAttributeTitle: title,
                attioAttributeType: type,
              }
            : m
        )
      )
    },
    []
  )

  // Update a mapping row's value template
  const updateMappingValue = useCallback((id: string, value: string) => {
    setFieldMappings((prev) =>
      prev.map((m) => (m.id === id ? { ...m, valueTemplate: value } : m))
    )
  }, [])

  // Delete a mapping row
  const deleteMapping = useCallback((id: string) => {
    setFieldMappings((prev) => prev.filter((m) => m.id !== id))
  }, [])

  // Handle field creation from dialog
  const handleFieldCreated = useCallback(
    (field: { slug: string; title: string; type: string; objectSlug: string }) => {
      // Add the new attribute to our local cache
      setAttributesByObject((prev) => {
        const existing = prev[field.objectSlug] || []
        return {
          ...prev,
          [field.objectSlug]: [
            ...existing,
            {
              id: "",
              slug: field.slug,
              title: field.title,
              type: field.type,
              isWritable: true,
            },
          ],
        }
      })
    },
    []
  )

  // Save mapping
  const handleSave = async () => {
    setIsSaving(true)
    setError(null)

    try {
      const mapping = {
        _type: "deal_mapping",
        _object: primaryObject,
        dealNameTemplate,
        fieldMappings: fieldMappings
          .filter((m) => m.attioAttributeSlug)
          .map((m) => ({
            attioAttributeSlug: m.attioAttributeSlug,
            attioObjectSlug: m.attioObjectSlug,
            attioAttributeTitle: m.attioAttributeTitle,
            attioAttributeType: m.attioAttributeType,
            valueTemplate: m.valueTemplate,
          })),
      }

      const res = await fetch("/api/integrations/attio/validate", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field_mapping: mapping }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || "Failed to save field mapping")
      }

      onSuccess({ dealNameTemplate, fieldMappings })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
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
            Discovering Attio fields...
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <span className="font-medium">Configure Deal Mapping</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Define how Beton creates deals in Attio when signals are detected.
          Use <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">{"{{variables}}"}</code> to
          insert dynamic values.
        </p>
      </div>

      {/* No deals object warning */}
      {!hasDealObject && (
        <Alert variant="info">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No Deals Object</AlertTitle>
          <AlertDescription>
            Your Attio workspace doesn&apos;t have a &quot;Deals&quot; object.
            Beton will create records on <strong>{primaryObject}</strong> instead.
            You can change this in Attio settings later.
          </AlertDescription>
        </Alert>
      )}

      {/* Deal Name Template */}
      <div className="space-y-2">
        <label className="text-sm font-medium block">Deal Name Template</label>
        <TemplateInput
          value={dealNameTemplate}
          onChange={setDealNameTemplate}
          placeholder='e.g., "{{company_name}} — {{signal_name}}"'
          showVariables={true}
        />
      </div>

      {/* Field Mappings */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Field Mappings</label>
          <span className="text-xs text-muted-foreground">
            {fieldMappings.length} {fieldMappings.length === 1 ? "field" : "fields"}
          </span>
        </div>

        {/* Column headers */}
        {fieldMappings.length > 0 && (
          <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <div className="flex-1">Attio Field</div>
            <div className="flex-1">Value</div>
            <div className="w-6" />
          </div>
        )}

        {/* Mapping rows */}
        <div className="space-y-2">
          {fieldMappings.map((mapping) => (
            <DealFieldRow
              key={mapping.id}
              attioAttributeSlug={mapping.attioAttributeSlug}
              attioObjectSlug={mapping.attioObjectSlug}
              valueTemplate={mapping.valueTemplate}
              options={comboboxOptions}
              onAttributeChange={(slug, objSlug, title, type) =>
                updateMappingAttribute(mapping.id, slug, objSlug, title, type)
              }
              onValueChange={(val) => updateMappingValue(mapping.id, val)}
              onDelete={() => deleteMapping(mapping.id)}
              onCreateNew={() => setCreateDialogOpen(true)}
            />
          ))}
        </div>

        {/* Add field button */}
        <Button
          variant="outline"
          size="sm"
          onClick={addMapping}
          className="w-full"
        >
          <Plus className="h-4 w-4" />
          Add Field Mapping
        </Button>
      </div>

      {/* Available variables reference */}
      <div className="rounded-lg border border-border p-3 bg-muted/30">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
          Available Variables
        </p>
        <div className="flex flex-wrap gap-1">
          {BETON_VARIABLES.map((v) => (
            <code
              key={v.key}
              className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
            >
              {`{{${v.key}}}`}
            </code>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <Alert variant="error">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Actions */}
      <Button onClick={handleSave} disabled={isSaving} className="w-full">
        {isSaving ? "Saving..." : "Save Deal Mapping"}
      </Button>

      <button
        type="button"
        onClick={() => onSuccess({ dealNameTemplate: "", fieldMappings: [] })}
        className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        Skip for now
      </button>

      {/* Create Field Dialog */}
      <CreateFieldDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        objectSlug={primaryObject}
        objectLabel={
          objects.find((o) => o.slug === primaryObject)?.singularNoun || primaryObject
        }
        onCreated={handleFieldCreated}
      />
    </div>
  )
}
