'use client'

import { useEffect } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useFieldMappingStore } from './store'
import type { ObjectId } from '@/lib/field-mapping/client'

const OBJECT_LABELS: Record<ObjectId, string> = {
  deals: 'Deals',
  people: 'People',
  companies: 'Companies',
  workspaces: 'Workspaces',
}

export function SaveBar() {
  const { dirtyByObj, dirtyCount, isSaving, saveError, saveAll, discardAll } =
    useFieldMappingStore()
  const hasDirty = dirtyCount > 0

  // ⌘S / Ctrl+S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void saveAll()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saveAll])

  const parts = (Object.entries(dirtyByObj) as Array<[ObjectId, number]>)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => ({ label: OBJECT_LABELS[k], n }))

  return (
    <div
      className={cn(
        'sticky top-0 z-40 transition-all duration-200',
        hasDirty
          ? 'bg-warning/20 border-b-2 border-foreground'
          : 'bg-background border-b-2 border-foreground/10',
      )}
    >
      <div className="max-w-[1360px] mx-auto px-8 h-11 flex items-center gap-3">
        {hasDirty ? (
          <>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
              <span className="relative flex size-2">
                <span className="absolute inset-0 rounded-full bg-destructive animate-ping opacity-60" />
                <span className="relative rounded-full size-2 bg-destructive" />
              </span>
              {dirtyCount} unsaved {dirtyCount === 1 ? 'change' : 'changes'}
            </span>
            <span className="text-foreground/40">·</span>
            <span className="text-xs text-foreground/70 flex items-center gap-2 min-w-0 truncate">
              {parts.map((p, i) => (
                <span key={p.label} className="truncate">
                  {i > 0 ? <span className="text-foreground/30 mr-2">·</span> : null}
                  <span className="font-semibold">{p.label}</span>
                  <span className="ml-1 text-foreground/50">({p.n})</span>
                </span>
              ))}
            </span>
            <div className="flex-1" />
            {saveError ? (
              <span className="text-xs text-destructive truncate max-w-[240px]">{saveError}</span>
            ) : null}
            <Button variant="ghost" size="xs" onClick={discardAll} disabled={isSaving}>
              Discard
            </Button>
            <Button size="sm" onClick={() => void saveAll()} disabled={isSaving}>
              {isSaving ? (
                'Saving…'
              ) : (
                <>
                  <Check className="size-3.5" strokeWidth={3} />
                  Save all
                </>
              )}
            </Button>
          </>
        ) : (
          <>
            <span className="inline-flex items-center gap-1.5 text-xs text-foreground/60">
              <span className="size-2 rounded-full bg-success" />
              All changes saved
            </span>
            <div className="flex-1" />
            <span className="text-xs text-foreground/40">⌘S to save</span>
          </>
        )}
      </div>
    </div>
  )
}
