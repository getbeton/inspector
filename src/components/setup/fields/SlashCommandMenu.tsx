import { cn } from "@/lib/utils"
import { BETON_VARIABLES } from "./TemplateInput"

interface SlashCommandMenuProps {
  query: string
  highlightIndex: number
  onSelect: (key: string) => void
  onMouseDown: (e: React.MouseEvent) => void
  visible: boolean
}

/**
 * Floating autocomplete dropdown triggered by typing `/` in a TemplateInput.
 *
 * Filters BETON_VARIABLES by the text typed after `/`, highlights the active
 * item for keyboard navigation, and calls `onSelect` with the chosen variable key.
 */
export function SlashCommandMenu({
  query,
  highlightIndex,
  onSelect,
  onMouseDown,
  visible,
}: SlashCommandMenuProps) {
  if (!visible) return null

  const lowerQuery = query.toLowerCase()
  const filtered = BETON_VARIABLES.filter(
    (v) =>
      v.key.toLowerCase().includes(lowerQuery) ||
      v.label.toLowerCase().includes(lowerQuery)
  )

  return (
    <div
      onMouseDown={onMouseDown}
      className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border border-border bg-popover shadow-lg"
    >
      {filtered.length === 0 ? (
        <div className="px-3 py-2 text-xs text-muted-foreground">
          No matching variables
        </div>
      ) : (
        <ul className="py-1">
          {filtered.map((v, i) => (
            <li key={v.key}>
              <button
                type="button"
                onClick={() => onSelect(v.key)}
                className={cn(
                  "flex w-full items-center justify-between px-3 py-1.5 text-xs",
                  "transition-colors",
                  i === highlightIndex
                    ? "bg-muted text-foreground"
                    : "text-foreground hover:bg-muted/50"
                )}
              >
                <span>{v.label}</span>
                <code className="ml-2 font-mono text-[10px] text-muted-foreground">
                  {`{{${v.key}}}`}
                </code>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
        <kbd className="font-mono">↑↓</kbd> navigate{" "}
        <kbd className="font-mono">↵</kbd> select{" "}
        <kbd className="font-mono">esc</kbd> dismiss
      </div>
    </div>
  )
}

/**
 * Returns the filtered variable list for a given slash query.
 * Extracted so TemplateInput can compute the count for highlight clamping.
 */
export function filterVariables(query: string) {
  const lowerQuery = query.toLowerCase()
  return BETON_VARIABLES.filter(
    (v) =>
      v.key.toLowerCase().includes(lowerQuery) ||
      v.label.toLowerCase().includes(lowerQuery)
  )
}
