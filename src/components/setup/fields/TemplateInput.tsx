"use client"

import { useRef, useCallback } from "react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

/**
 * Available Beton template variables for deal field mapping.
 * These get resolved against sample data in the preview panel.
 */
export const BETON_VARIABLES = [
  { key: "company_name", label: "Company Name" },
  { key: "company_domain", label: "Domain" },
  { key: "signal_name", label: "Signal Name" },
  { key: "signal_type", label: "Signal Type" },
  { key: "health_score", label: "Health Score" },
  { key: "concrete_grade", label: "Concrete Grade" },
  { key: "signal_count", label: "Signal Count" },
  { key: "deal_value", label: "Deal Value" },
  { key: "detected_at", label: "Detected At" },
] as const

export type BetonVariable = (typeof BETON_VARIABLES)[number]["key"]

export interface TemplateInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  showVariables?: boolean
  className?: string
}

/**
 * Text input that supports {{variable}} token insertion.
 *
 * Clickable variable chips below the input insert tokens at the cursor position.
 * The preview panel resolves these tokens against sample data via simple
 * string replacement: `{{company_name}}` → `"Acme Corp"`.
 */
export function TemplateInput({
  value,
  onChange,
  placeholder = "Enter value or use {{variables}}...",
  disabled = false,
  showVariables = true,
  className,
}: TemplateInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const insertVariable = useCallback(
    (varKey: string) => {
      const token = `{{${varKey}}}`
      const input = inputRef.current
      if (!input) {
        // Fallback: append to end
        onChange(value + token)
        return
      }

      const start = input.selectionStart ?? value.length
      const end = input.selectionEnd ?? value.length
      const newValue = value.slice(0, start) + token + value.slice(end)
      onChange(newValue)

      // Restore cursor position after the inserted token
      requestAnimationFrame(() => {
        const newPos = start + token.length
        input.setSelectionRange(newPos, newPos)
        input.focus()
      })
    },
    [value, onChange]
  )

  return (
    <div className={cn("space-y-2", className)}>
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange((e.target as HTMLInputElement).value)}
        placeholder={placeholder}
        disabled={disabled}
        className="font-mono text-xs"
      />

      {showVariables && !disabled && (
        <div className="flex flex-wrap gap-1">
          {BETON_VARIABLES.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => insertVariable(v.key)}
              className="inline-flex"
            >
              <Badge
                variant="outline"
                size="sm"
                className="cursor-pointer hover:bg-muted/80 transition-colors font-mono text-[10px]"
              >
                {`{{${v.key}}}`}
              </Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Resolve template variables in a string against sample data.
 * E.g., `"{{company_name}} — {{signal_name}}"` → `"Acme Corp — Product Qualified Lead"`
 */
export function resolveTemplate(
  template: string,
  data: Record<string, unknown>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const val = data[key]
    return val !== undefined ? String(val) : match
  })
}
