"use client"

import { useState, useMemo, useRef, useCallback, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Popover, PopoverTrigger, PopoverPopup } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  ChevronDown,
  Search,
  Type,
  Hash,
  Calendar,
  DollarSign,
  CheckSquare,
  List,
  Mail,
  Phone,
  Link2,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

/** Map Attio field types to icons */
const TYPE_ICONS: Record<string, LucideIcon> = {
  text: Type,
  number: Hash,
  currency: DollarSign,
  date: Calendar,
  checkbox: CheckSquare,
  select: List,
  status: List,
  email: Mail,
  phone: Phone,
  url: Link2,
}

export interface ComboboxOption {
  value: string
  label: string
  group?: string
  type?: string
  /** Predefined values for select/status fields */
  selectOptions?: Array<{ value: string; label: string }>
}

export interface ComboboxProps {
  value: string | null
  onChange: (value: string | null) => void
  options: ComboboxOption[]
  placeholder?: string
  searchable?: boolean
  disabled?: boolean
  className?: string
}

/**
 * Searchable single-select dropdown with grouped options.
 *
 * Follows the EventPicker pattern (Popover + Input + ScrollArea)
 * and supports:
 * - Option grouping (e.g., "Deal", "Company", "Person" subsections)
 * - Type icons next to each option (text, number, date, etc.)
 * - "Group → Label" display in the closed trigger
 * - Keyboard navigation (arrows, enter, escape)
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = "Select...",
  searchable = true,
  disabled = false,
  className,
}: ComboboxProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const listRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Filter options by search
  const filtered = useMemo(() => {
    if (!search) return options
    const q = search.toLowerCase()
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q) ||
        (o.group && o.group.toLowerCase().includes(q))
    )
  }, [options, search])

  // Group filtered options
  const grouped = useMemo(() => {
    const groups = new Map<string, ComboboxOption[]>()
    for (const opt of filtered) {
      const key = opt.group || ""
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(opt)
    }
    return groups
  }, [filtered])

  // Flat list for keyboard navigation
  const flatFiltered = useMemo(() => {
    const flat: ComboboxOption[] = []
    for (const opts of grouped.values()) {
      flat.push(...opts)
    }
    return flat
  }, [grouped])

  // Reset state on open
  /* eslint-disable react-hooks/set-state-in-effect -- resetting transient UI state when popover opens */
  useEffect(() => {
    if (open) {
      setSearch("")
      setHighlightIndex(-1)
      requestAnimationFrame(() => {
        searchRef.current?.focus()
      })
    }
  }, [open])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll("[data-combobox-item]")
      items[highlightIndex]?.scrollIntoView({ block: "nearest" })
    }
  }, [highlightIndex])

  const handleSelect = useCallback(
    (optValue: string) => {
      onChange(optValue)
      setOpen(false)
    },
    [onChange]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          setHighlightIndex((prev) =>
            prev < flatFiltered.length - 1 ? prev + 1 : 0
          )
          break
        case "ArrowUp":
          e.preventDefault()
          setHighlightIndex((prev) =>
            prev > 0 ? prev - 1 : flatFiltered.length - 1
          )
          break
        case "Enter":
          e.preventDefault()
          if (highlightIndex >= 0 && highlightIndex < flatFiltered.length) {
            handleSelect(flatFiltered[highlightIndex].value)
          }
          break
        case "Escape":
          e.preventDefault()
          setOpen(false)
          break
      }
    },
    [flatFiltered, highlightIndex, handleSelect]
  )

  // Selected option — used for trigger display and type info
  const selectedOption = options.find((o) => o.value === value)
  const displayLabel = selectedOption
    ? selectedOption.group
      ? `${selectedOption.group} \u2192 ${selectedOption.label}`
      : selectedOption.label
    : null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<button type="button" />}
        disabled={disabled}
        className={cn(
          "flex items-center justify-between gap-2 w-full min-h-[2.25rem] px-3 py-1.5",
          "border-2 border-foreground/20 bg-background text-sm text-left",
          "hover:bg-muted/50 transition-colors",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "focus-visible:border-foreground focus-visible:shadow-[2px_2px_0_var(--color-foreground)]",
          className
        )}
      >
        <span
          className={cn(
            "truncate text-xs",
            !displayLabel && "text-muted-foreground"
          )}
        >
          {displayLabel || placeholder}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </PopoverTrigger>

      <PopoverPopup
        side="bottom"
        align="start"
        className="min-w-[var(--anchor-width)] w-72"
        viewportClassName="py-2"
      >
        <div onKeyDown={handleKeyDown}>
          {/* Search input */}
          {searchable && (
            <div className="px-3 pb-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  ref={searchRef}
                  placeholder="Search fields..."
                  value={search}
                  onChange={(e) => {
                    setSearch((e.target as HTMLInputElement).value)
                    setHighlightIndex(-1)
                  }}
                  className="pl-8"
                  size="sm"
                />
              </div>
            </div>
          )}

          {/* Options list */}
          <ScrollArea className="max-h-56">
            <div ref={listRef} className="px-1">
              {filtered.length === 0 ? (
                <div className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">
                    {search ? "No matches found." : "No options available."}
                  </p>
                </div>
              ) : (
                Array.from(grouped.entries()).map(([group, opts]) => (
                  <div key={group || "__ungrouped"}>
                    {/* Group header */}
                    {group && (
                      <div className="px-2 pt-2 pb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          {group}
                        </span>
                      </div>
                    )}
                    {/* Options */}
                    {opts.map((opt) => {
                      const flatIdx = flatFiltered.indexOf(opt)
                      const isHighlighted = flatIdx === highlightIndex
                      const isSelected = opt.value === value
                      const TypeIcon = TYPE_ICONS[opt.type || "text"] || Type
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          data-combobox-item
                          onClick={() => handleSelect(opt.value)}
                          className={cn(
                            "w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors",
                            "flex items-center gap-2",
                            isSelected && "bg-primary/10 font-medium",
                            isHighlighted && !isSelected && "bg-muted",
                            !isSelected && !isHighlighted && "hover:bg-muted/50"
                          )}
                        >
                          <TypeIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate">{opt.label}</span>
                        </button>
                      )
                    })}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </PopoverPopup>
    </Popover>
  )
}
