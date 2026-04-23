'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { FieldSchema } from '@/lib/field-mapping/client'

interface FieldPickerProps {
  fields: FieldSchema[]
  takenIds: Set<string>
  onPick: (fieldId: string) => void
  trigger: ReactNode
}

export function FieldPicker({ fields, takenIds, onPick, trigger }: FieldPickerProps) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  useEffect(() => {
    if (!open) setQ('')
  }, [open])

  const available = useMemo(() => {
    const s = q.trim().toLowerCase()
    return fields.filter((f) => {
      if (takenIds.has(f.id)) return false
      if (!s) return true
      return (
        f.label.toLowerCase().includes(s) ||
        f.id.toLowerCase().includes(s) ||
        (f.group || '').toLowerCase().includes(s)
      )
    })
  }, [fields, takenIds, q])

  const byGroup = useMemo(() => {
    const m = new Map<string, FieldSchema[]>()
    for (const f of available) {
      const g = f.group || 'Other'
      if (!m.has(g)) m.set(g, [])
      m.get(g)!.push(f)
    }
    return Array.from(m.entries())
  }, [available])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<span className="inline-block" />}>{trigger}</PopoverTrigger>
      <PopoverContent className="!p-0" viewportClassName="!p-0" side="bottom" align="start">
        <div className="w-[420px] max-w-[92vw] flex flex-col">
          <div className="p-2 border-b-2 border-foreground/10">
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search fields…"
            />
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {available.length === 0 ? (
              <div className="p-6 text-center text-xs text-foreground/50">
                {takenIds.size >= fields.length
                  ? `All ${fields.length} fields are mapped.`
                  : `No field matches "${q}"`}
              </div>
            ) : null}
            {byGroup.map(([group, list]) => (
              <div key={group}>
                <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-foreground/40 font-bold">
                  {group}
                </div>
                {list.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      onPick(f.id)
                      setOpen(false)
                    }}
                    className="w-full flex items-center gap-2 px-3 h-8 text-xs hover:bg-foreground/5 text-left"
                  >
                    <span className="font-semibold">{f.label}</span>
                    {f.required ? <span className="text-destructive">*</span> : null}
                    <span className="text-foreground/40 font-mono text-[10px]">{f.kind}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="border-t-2 border-foreground/10 px-3 py-2 text-[10px] text-foreground/50 bg-muted/30 text-right">
            {available.length} available · {takenIds.size} of {fields.length} mapped
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
