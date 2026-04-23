'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Check, ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SampleSubject } from '@/lib/field-mapping/client'

interface SubjectPickerProps {
  subjects: SampleSubject[]
  currentId: string | null
  onPick: (id: string) => void
  subjectNoun: string
  trigger?: ReactNode
}

export function SubjectPicker({
  subjects,
  currentId,
  onPick,
  subjectNoun,
  trigger,
}: SubjectPickerProps) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const current = subjects.find((s) => s.id === currentId) ?? subjects[0] ?? null

  useEffect(() => {
    if (!open) setQ('')
  }, [open])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return subjects
    return subjects.filter(
      (sub) =>
        (sub.name || '').toLowerCase().includes(s) ||
        (sub.email || '').toLowerCase().includes(s) ||
        (sub.domain || '').toLowerCase().includes(s),
    )
  }, [subjects, q])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="inline-flex items-center gap-2 border-2 border-foreground/20 bg-background px-1.5 h-7 text-xs hover:border-foreground hover:shadow-[2px_2px_0_var(--color-foreground)] hover:-translate-x-px hover:-translate-y-px transition-all"
          >
            <span className="font-semibold truncate max-w-[140px]">
              {current?.name ?? 'Pick subject'}
            </span>
            {current?.email || current?.domain ? (
              <span className="text-foreground/50 font-mono text-[11px] truncate max-w-[160px]">
                {current.email || current.domain}
              </span>
            ) : null}
            <ChevronDown className="size-3 text-foreground/40" />
          </button>
        }
      >
        {trigger ?? <span />}
      </PopoverTrigger>
      <PopoverContent className="!p-0" viewportClassName="!p-0" side="bottom" align="end">
        <div className="w-[480px] max-w-[92vw] flex">
          {/* List */}
          <div className="flex-1 min-w-0 border-r-2 border-foreground/10 flex flex-col">
            <div className="p-2 border-b-2 border-foreground/10">
              <Input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Search ${subjectNoun}s…`}
              />
            </div>
            <div className="max-h-[320px] overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="p-6 text-center text-xs text-foreground/50">
                  No {subjectNoun}s match "{q}"
                </div>
              ) : null}
              {filtered.map((sub) => {
                const selected = sub.id === currentId
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => {
                      onPick(sub.id)
                      setOpen(false)
                    }}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 text-xs text-left',
                      selected ? 'bg-primary/10' : 'hover:bg-foreground/5',
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate inline-flex items-center gap-1.5">
                        {sub.name || <span className="italic text-foreground/50">(anonymous)</span>}
                        {selected ? <Check className="size-3 text-primary" strokeWidth={3} /> : null}
                      </div>
                      <div className="text-[10px] text-foreground/50 font-mono truncate">
                        {sub.email || sub.domain || sub.distinctId}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
            <div className="border-t-2 border-foreground/10 px-3 py-1.5 text-[10px] text-foreground/50 bg-muted/30">
              {filtered.length} of {subjects.length}
            </div>
          </div>
          {/* Preview */}
          <div className="w-[200px] bg-muted/30 p-3 flex flex-col">
            <div className="text-[10px] uppercase tracking-wider text-foreground/40 font-bold mb-2">
              Preview
            </div>
            {current ? (
              <>
                <div className="font-semibold text-sm truncate mb-2">
                  {current.name || '(anonymous)'}
                </div>
                <div className="border-t border-foreground/10 pt-2 space-y-1 overflow-y-auto">
                  {Object.entries(current.props).slice(0, 10).map(([k, v]) => (
                    <div
                      key={k}
                      className="grid grid-cols-[80px_1fr] gap-2 text-[10px] items-baseline"
                    >
                      <span className="font-mono text-foreground/50 truncate">{k}</span>
                      <span className="font-mono text-foreground truncate" title={String(v)}>
                        {v === '' ? (
                          <span className="italic text-foreground/30">empty</span>
                        ) : (
                          String(v).slice(0, 32)
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-[11px] text-foreground/40 italic">no subject</div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
