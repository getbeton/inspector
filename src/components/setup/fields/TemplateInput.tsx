"use client"

import { useRef, useCallback, useState } from "react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { SlashCommandMenu, filterVariables } from "./SlashCommandMenu"

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
  className?: string
}

/**
 * Text input that supports {{variable}} token insertion via slash commands.
 *
 * Typing `/` opens an inline autocomplete dropdown filtered by the text after
 * the slash. Arrow keys navigate, Enter/click selects, Escape dismisses.
 * On selection, the `/query` text is replaced with `{{variable_name}}`.
 */
export function TemplateInput({
  value,
  onChange,
  placeholder = "Type / to insert variables...",
  disabled = false,
  className,
}: TemplateInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  // Slash-command state
  const [slashActive, setSlashActive] = useState(false)
  const [slashStart, setSlashStart] = useState(-1)
  const [slashQuery, setSlashQuery] = useState("")
  const [highlightIndex, setHighlightIndex] = useState(0)

  /** Insert a {{variable}} token, replacing the `/query` range. */
  const handleSlashSelect = useCallback(
    (varKey: string) => {
      const token = `{{${varKey}}}`
      const input = inputRef.current

      // Replace from slashStart (the `/`) to current cursor
      const cursorPos = input?.selectionStart ?? value.length
      const newValue =
        value.slice(0, slashStart) + token + value.slice(cursorPos)
      onChange(newValue)

      // Close menu and restore cursor
      setSlashActive(false)
      setSlashQuery("")
      setHighlightIndex(0)

      requestAnimationFrame(() => {
        if (input) {
          const newPos = slashStart + token.length
          input.setSelectionRange(newPos, newPos)
          input.focus()
        }
      })
    },
    [value, onChange, slashStart]
  )

  /** Detect `/` trigger on every input change. */
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value
      onChange(newValue)

      const cursor = e.target.selectionStart ?? newValue.length

      // Walk backward from cursor to find an unmatched `/`
      let foundSlash = -1
      for (let i = cursor - 1; i >= 0; i--) {
        const ch = newValue[i]
        if (ch === "/") {
          foundSlash = i
          break
        }
        // Stop scanning if we hit whitespace before finding `/`
        if (/\s/.test(ch)) break
      }

      if (foundSlash >= 0) {
        const query = newValue.slice(foundSlash + 1, cursor)
        setSlashActive(true)
        setSlashStart(foundSlash)
        setSlashQuery(query)
        // Clamp highlight index to filtered list length
        const count = filterVariables(query).length
        setHighlightIndex((prev) => (prev >= count ? Math.max(0, count - 1) : prev))
      } else {
        setSlashActive(false)
        setSlashQuery("")
        setHighlightIndex(0)
      }
    },
    [onChange]
  )

  /** Keyboard navigation when the slash menu is open. */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!slashActive) return

      const filtered = filterVariables(slashQuery)
      if (filtered.length === 0) {
        if (e.key === "Escape") {
          setSlashActive(false)
          setSlashQuery("")
          setHighlightIndex(0)
        }
        return
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          setHighlightIndex((prev) => (prev + 1) % filtered.length)
          break
        case "ArrowUp":
          e.preventDefault()
          setHighlightIndex((prev) =>
            prev <= 0 ? filtered.length - 1 : prev - 1
          )
          break
        case "Enter":
          e.preventDefault()
          handleSlashSelect(filtered[highlightIndex].key)
          break
        case "Escape":
          e.preventDefault()
          setSlashActive(false)
          setSlashQuery("")
          setHighlightIndex(0)
          break
      }
    },
    [slashActive, slashQuery, highlightIndex, handleSlashSelect]
  )

  /** Prevent input blur when clicking menu items. */
  const handleMenuMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
  }, [])

  /** Close menu on blur (unless clicking the menu, handled by onMouseDown). */
  const handleBlur = useCallback(() => {
    setSlashActive(false)
    setSlashQuery("")
    setHighlightIndex(0)
  }, [])

  return (
    <div className={cn("relative", className)}>
      <Input
        ref={inputRef}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        className="font-mono text-xs"
      />

      <SlashCommandMenu
        query={slashQuery}
        highlightIndex={highlightIndex}
        onSelect={handleSlashSelect}
        onMouseDown={handleMenuMouseDown}
        visible={slashActive && !disabled}
      />
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
