"use client"

import { cn } from "@/lib/utils"
import { Combobox, type ComboboxOption } from "@/components/ui/combobox"
import { TemplateInput } from "./TemplateInput"
import { validateFieldValue } from "./validation"
import { Trash2 } from "lucide-react"

/** Type-specific placeholder text for the value input */
const TYPE_PLACEHOLDERS: Record<string, string> = {
  number: "Number or {{variable}}...",
  currency: "Amount or {{variable}}...",
  date: "Date or {{variable}}...",
  checkbox: "true/false or {{variable}}...",
  email: "Email or {{variable}}...",
  phone: "Phone or {{variable}}...",
  url: "URL or {{variable}}...",
  text: "Value or {{variable}}...",
}

export interface DealFieldRowProps {
  attioAttributeSlug: string | null
  valueTemplate: string
  options: ComboboxOption[]
  onAttributeChange: (slug: string | null, objectSlug: string, title: string, type: string) => void
  onValueChange: (value: string) => void
  onDelete: () => void
  disabled?: boolean
  className?: string
}

/**
 * A single mapping row in the deal field mapping step.
 * Left: Combobox to pick an Attio field (grouped by object).
 * Right: Type-appropriate value input:
 *   - select/status → native <select> with predefined options
 *   - all others → TemplateInput with {{variable}} support
 */
export function DealFieldRow({
  attioAttributeSlug,
  valueTemplate,
  options,
  onAttributeChange,
  onValueChange,
  onDelete,
  disabled = false,
  className,
}: DealFieldRowProps) {
  // Look up the selected option for type info and select options
  const selectedOption = options.find((o) => o.value === attioAttributeSlug)
  const attributeType = selectedOption?.type || "text"
  const selectOptions = selectedOption?.selectOptions || []

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

  const renderValueInput = () => {
    // Select/status fields → native dropdown with predefined options
    if (
      (attributeType === "select" || attributeType === "status") &&
      selectOptions.length > 0
    ) {
      return (
        <select
          value={valueTemplate}
          onChange={(e) => onValueChange(e.target.value)}
          disabled={disabled}
          className={cn(
            "w-full min-h-[2.25rem] px-3 py-1.5 text-xs",
            "border-2 border-foreground/20 bg-background",
            "hover:bg-muted/50 transition-colors",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "focus-visible:border-foreground focus-visible:outline-none",
          )}
        >
          <option value="">Select value...</option>
          {selectOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )
    }

    // All other types → TemplateInput with type-specific placeholder
    const error = validateFieldValue(valueTemplate, attributeType)
    return (
      <>
        <TemplateInput
          value={valueTemplate}
          onChange={onValueChange}
          placeholder={TYPE_PLACEHOLDERS[attributeType] || TYPE_PLACEHOLDERS.text}
          disabled={disabled}
        />
        {error && (
          <p className="text-destructive text-[10px] mt-1">{error}</p>
        )}
      </>
    )
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
          disabled={disabled}
        />
      </div>

      {/* Value input (type-aware) */}
      <div className="flex-1 min-w-0">
        {renderValueInput()}
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
