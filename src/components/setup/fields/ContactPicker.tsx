"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Search, User, Loader2 } from "lucide-react"

interface AttioPersonResult {
  id: string
  name: string
  email: string | null
}

/**
 * Data returned when a contact is selected.
 * Used by the wizard to populate preview cards with real Attio data.
 */
export interface SelectedContact {
  personId: string
  personName: string
  email: string | null
}

interface ContactPickerProps {
  onSelect: (contact: SelectedContact) => void
  disabled?: boolean
  className?: string
}

/**
 * Async search picker for Attio people records.
 *
 * Debounces user input (300ms), fetches matching contacts from
 * `/api/integrations/attio/search?object=people`, and lets the user
 * select one to populate the deal card / Slack notification previews
 * with real data from their CRM.
 *
 * Neobrutalist styling: thick focus border, offset shadow on dropdown.
 */
export function ContactPicker({ onSelect, disabled, className }: ContactPickerProps) {
  const [search, setSearch] = useState("")
  const [results, setResults] = useState<AttioPersonResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<AttioPersonResult | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleSearch = useCallback((value: string) => {
    setSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (value.length < 2) {
      setResults([])
      setOpen(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(
          `/api/integrations/attio/search?q=${encodeURIComponent(value)}&object=people`
        )
        if (res.ok) {
          const data = await res.json()
          setResults(data.results || [])
          setOpen(true)
        }
      } catch {
        // Silently fail — user can retry
      } finally {
        setLoading(false)
      }
    }, 300)
  }, [])

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const handleSelect = useCallback(
    (person: AttioPersonResult) => {
      setSelected(person)
      setSearch(person.name)
      setOpen(false)

      onSelect({
        personId: person.id,
        personName: person.name,
        email: person.email,
      })
    },
    [onSelect]
  )

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
        Preview contact from Attio
      </label>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => {
            if (results.length > 0) setOpen(true)
          }}
          placeholder="Search contacts in Attio..."
          disabled={disabled}
          className={cn(
            "w-full h-9 pl-8 pr-8 text-xs rounded",
            "border-2 border-foreground/20 bg-background",
            "placeholder:text-muted-foreground/50",
            "focus:border-foreground focus:shadow-[2px_2px_0_var(--color-foreground)] focus:outline-none",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "transition-all"
          )}
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground animate-spin" />
        )}
      </div>

      {/* Results dropdown */}
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border-2 border-foreground/15 bg-background shadow-[4px_4px_0_rgba(0,0,0,0.08)] overflow-hidden">
          <div className="max-h-48 overflow-y-auto py-1">
            {results.map((person) => (
              <button
                key={person.id}
                type="button"
                onClick={() => handleSelect(person)}
                className={cn(
                  "w-full text-left px-3 py-2 text-xs",
                  "flex items-center gap-2.5",
                  "hover:bg-muted/50 transition-colors",
                  selected?.id === person.id && "bg-primary/5"
                )}
              >
                <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <User className="h-3 w-3 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{person.name}</div>
                  {person.email && (
                    <div className="text-muted-foreground font-mono text-[10px] truncate">
                      {person.email}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {open && results.length === 0 && search.length >= 2 && !loading && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border-2 border-foreground/15 bg-background shadow-md p-3">
          <p className="text-xs text-muted-foreground text-center">
            No contacts found for &ldquo;{search}&rdquo;
          </p>
        </div>
      )}

      {/* Selected indicator */}
      {selected && (
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <User className="h-3 w-3" />
          <span>
            Using <strong className="text-foreground">{selected.name}</strong> for
            preview
          </span>
          {selected.email && (
            <span className="font-mono text-[10px]">({selected.email})</span>
          )}
        </div>
      )}
    </div>
  )
}
