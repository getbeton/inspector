"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Spinner } from "@/components/ui/spinner"
import { TemplateInput, BETON_VARIABLES } from "../fields/TemplateInput"
import { DealFieldRow } from "../fields/DealFieldRow"
import { validateFieldValue } from "../fields/validation"
import type { ComboboxOption } from "@/components/ui/combobox"
import { Plus, AlertCircle, FileText } from "lucide-react"

interface AttioAttribute {
  id: string
  slug: string
  title: string
  type: string
  isWritable: boolean
  /** Predefined options for select/status type fields */
  selectOptions?: Array<{ value: string; label: string }>
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
  notificationText: string
  fieldMappings: FieldMapping[]
}

/** Mock Attio schema used in demo mode */
const DEMO_OBJECTS: AttioObject[] = [
  { id: "1", slug: "deals", singularNoun: "deal", pluralNoun: "deals" },
  { id: "2", slug: "companies", singularNoun: "company", pluralNoun: "companies" },
  { id: "3", slug: "people", singularNoun: "person", pluralNoun: "people" },
]

const DEMO_ATTRIBUTES: Record<string, AttioAttribute[]> = {
  deals: [
    { id: "d1", slug: "name", title: "Name", type: "text", isWritable: true },
    {
      id: "d2",
      slug: "stage",
      title: "Stage",
      type: "select",
      isWritable: true,
      selectOptions: [
        { value: "new", label: "New" },
        { value: "qualified", label: "Qualified" },
        { value: "proposal", label: "Proposal" },
        { value: "negotiation", label: "Negotiation" },
        { value: "won", label: "Won" },
        { value: "lost", label: "Lost" },
      ],
    },
    { id: "d3", slug: "value", title: "Deal Value", type: "currency", isWritable: true },
    { id: "d4", slug: "close_date", title: "Close Date", type: "date", isWritable: true },
    { id: "d5", slug: "source", title: "Source", type: "text", isWritable: true },
    { id: "d6", slug: "probability", title: "Probability", type: "number", isWritable: true },
    {
      id: "d7",
      slug: "priority",
      title: "Priority",
      type: "select",
      isWritable: true,
      selectOptions: [
        { value: "low", label: "Low" },
        { value: "medium", label: "Medium" },
        { value: "high", label: "High" },
        { value: "urgent", label: "Urgent" },
      ],
    },
  ],
  companies: [
    { id: "c1", slug: "name", title: "Company Name", type: "text", isWritable: true },
    { id: "c2", slug: "domain", title: "Domain", type: "text", isWritable: true },
    { id: "c3", slug: "industry", title: "Industry", type: "text", isWritable: true },
    { id: "c4", slug: "employee_count", title: "Employee Count", type: "number", isWritable: true },
    { id: "c5", slug: "health_score", title: "Health Score", type: "number", isWritable: true },
  ],
  people: [
    { id: "p1", slug: "name", title: "Full Name", type: "text", isWritable: true },
    { id: "p2", slug: "email", title: "Email", type: "email", isWritable: true },
    { id: "p3", slug: "title", title: "Job Title", type: "text", isWritable: true },
  ],
}

export interface DealFieldMappingStepProps {
  onSuccess: (mapping: DealMappingState) => void
  /** Live callback for real-time preview updates */
  onMappingChange?: (mapping: DealMappingState) => void
  /** Demo mode: use mock schema, skip API calls */
  demoMode?: boolean
  className?: string
}

/**
 * Deal-focused field mapping step — replaces the old AttioFieldMappingStep.
 *
 * Users configure how Beton creates deals in Attio:
 * - Deal name template (e.g., "{{company_name}} — {{signal_name}}")
 * - Slack notification text template
 * - Dynamic field mapping rows: Attio field → value template
 * - Fields grouped from ALL Attio objects (deals, companies, people)
 *
 * Returns both config (left panel) and preview data for CrmCardPreview (right panel).
 */
export function DealFieldMappingStep({ onSuccess, onMappingChange, demoMode = false, className }: DealFieldMappingStepProps) {
  const idCounter = useRef(0)
  const genId = useCallback(() => `field_${++idCounter.current}`, [])

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
  const [notificationText, setNotificationText] = useState("New deal signal detected")
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([])

  // Notify parent of mapping changes for live preview
  useEffect(() => {
    onMappingChange?.({ dealNameTemplate, notificationText, fieldMappings })
  }, [dealNameTemplate, notificationText, fieldMappings, onMappingChange])

  // Load Attio objects and attributes on mount
  useEffect(() => {
    // In demo mode, use mock data immediately
    if (demoMode) {
      setObjects(DEMO_OBJECTS)
      setAttributesByObject(DEMO_ATTRIBUTES)
      setIsLoading(false)
      return
    }

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
  }, [demoMode])

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
          label: attr.title,
          group: groupLabel,
          type: attr.type,
          selectOptions: attr.selectOptions,
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
  }, [genId])

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
                // Clear value when switching to a different field type
                valueTemplate: m.attioAttributeType !== type ? "" : m.valueTemplate,
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

  // Check if any mapped field has a validation error
  const hasValidationErrors = useMemo(
    () =>
      fieldMappings.some(
        (m) =>
          m.attioAttributeSlug &&
          validateFieldValue(m.valueTemplate, m.attioAttributeType) !== null
      ),
    [fieldMappings]
  )

  // Save mapping
  const handleSave = async () => {
    // In demo mode, skip API call and report success immediately
    if (demoMode) {
      onSuccess({ dealNameTemplate, notificationText, fieldMappings })
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const mapping = {
        _type: "deal_mapping",
        _object: primaryObject,
        dealNameTemplate,
        notificationText,
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

      onSuccess({ dealNameTemplate, notificationText, fieldMappings })
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
          Type <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">/</code> in
          any input to insert dynamic variables.
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
          placeholder='Type / to insert variables'
        />
      </div>

      {/* Notification Text Template */}
      <div className="space-y-2">
        <label className="text-sm font-medium block">Slack Notification Text</label>
        <TemplateInput
          value={notificationText}
          onChange={setNotificationText}
          placeholder='Type / to insert variables'
        />
        <p className="text-[10px] text-muted-foreground">
          Message body shown in the Slack notification when a signal is detected.
        </p>
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
              valueTemplate={mapping.valueTemplate}
              options={comboboxOptions}
              onAttributeChange={(slug, objSlug, title, type) =>
                updateMappingAttribute(mapping.id, slug, objSlug, title, type)
              }
              onValueChange={(val) => updateMappingValue(mapping.id, val)}
              onDelete={() => deleteMapping(mapping.id)}
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
          <span className="ml-2 font-normal normal-case tracking-normal">
            — Type <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono">/</kbd> to insert
          </span>
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

      {/* Validation hint */}
      {hasValidationErrors && (
        <p className="text-destructive text-xs text-center">
          Fix validation errors above to save
        </p>
      )}

      {/* Actions */}
      <Button onClick={handleSave} disabled={isSaving || hasValidationErrors} className="w-full">
        {isSaving ? "Saving..." : "Save Deal Mapping"}
      </Button>

      <button
        type="button"
        onClick={() => onSuccess({ dealNameTemplate: "", notificationText: "", fieldMappings: [] })}
        className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        Skip for now
      </button>
    </div>
  )
}
