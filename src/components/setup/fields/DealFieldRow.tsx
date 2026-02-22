"use client"

import { cn } from "@/lib/utils"
import { Combobox, type ComboboxOption } from "@/components/ui/combobox"
import { TemplateInput } from "./TemplateInput"
import { Trash2 } from "lucide-react"

export interface DealFieldRowProps {
  attioAttributeSlug: string | null
  valueTemplate: string
  options: ComboboxOption[]
  onAttributeChange: (slug: string | null, objectSlug: string, title: string, type: string) => void
  onValueChange: (value: string) => void
  onDelete: () => void
  onCreateNew: () => void
  disabled?: boolean
  className?: string
}

/**
 * A single mapping row in the deal field mapping step.
 * Left: Combobox to pick an Attio field (grouped by object).
 * Right: TemplateInput to define the value (literal or {{variable}}).
 */
export function DealFieldRow({
  attioAttributeSlug,
  valueTemplate,
  options,
  onAttributeChange,
  onValueChange,
  onDelete,
  onCreateNew,
  disabled = false,
  className,
}: DealFieldRowProps) {
  const handleAttributeSelect = (val: string | null) => {
    if (!val) {
      onAttributeChange(null, "", "", "")
      return
    }
    // Parse the composite value: "objectSlug::attributeSlug"
    const opt = options.find((o) => o.value === val)
    if (opt) {
      const [objSlug] = val.split("::")
      onAttributeChange(opt.value, objSlug, opt.label, opt.type || "text")
    }
  }

  return (
    <div className={cn("flex items-start gap-3", className)}>
      {/* Attio field selector */}
      <div className="flex-1 min-w-0">
        <Combobox
          value={attioAttributeSlug}
          onChange={handleAttributeSelect}
          options={options}
          placeholder="Select Attio field..."
          onCreateNew={onCreateNew}
          createNewLabel="Create new field..."
          disabled={disabled}
        />
      </div>

      {/* Value template */}
      <div className="flex-1 min-w-0">
        <TemplateInput
          value={valueTemplate}
          onChange={onValueChange}
          placeholder="Value or {{variable}}..."
          disabled={disabled}
          showVariables={false}
        />
      </div>

      {/* Delete button */}
      <button
        type="button"
        onClick={onDelete}
        disabled={disabled}
        className="mt-1.5 p-1 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
        aria-label="Remove mapping"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}
