'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogPanel,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Check, Plus, RefreshCw } from 'lucide-react'
import type { Destination, ImpactSummary, MappingRow, ObjectId } from '@/lib/field-mapping/client'

interface ImpactPanelProps {
  open: boolean
  destination: Destination
  mappings: Record<ObjectId, MappingRow[]>
  onConfirm: () => void
  onCancel: () => void
  isSaving: boolean
}

/**
 * Intercepts "Save all" when any row uses a link_* / actor_* source: runs
 * POST /preview-impact against sample subjects to surface how many existing
 * records would be matched vs newly created before the mapping takes effect.
 */
export function ImpactPanel({
  open,
  destination,
  mappings,
  onConfirm,
  onCancel,
  isSaving,
}: ImpactPanelProps) {
  const [summaries, setSummaries] = useState<ImpactSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    const objectsWithLinks = (Object.keys(mappings) as ObjectId[]).filter((objId) =>
      (mappings[objId] ?? []).some(
        (r) =>
          r.source &&
          (r.source.type.startsWith('link_') || r.source.type.startsWith('actor_')),
      ),
    )

    if (objectsWithLinks.length === 0) {
      // Nothing to preview — summaries stay empty, user can save directly.
      setSummaries([])
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all(
      objectsWithLinks.map((objectId) =>
        fetch(`/api/integrations/${destination}/preview-impact`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ objectId, rows: mappings[objectId] ?? [] }),
        })
          .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
          .then((json) => json as ImpactSummary),
      ),
    )
      .then((results) => {
        if (!cancelled) setSummaries(results)
      })
      .catch((err) => {
        if (!cancelled) setError(typeof err === 'string' ? err : 'Preview failed')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, destination, mappings])

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent className="!max-w-xl">
        <DialogHeader>
          <DialogTitle>Preview impact</DialogTitle>
          <DialogDescription>
            Dry-run against a sample of {summaries[0]?.sampleSize ?? '…'} recent subjects.
            Save will apply these mappings going forward; no records are written yet.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-foreground/60">
              <RefreshCw className="size-3 animate-spin" /> Computing impact…
            </div>
          ) : error ? (
            <div className="text-xs text-destructive flex items-start gap-2">
              <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : summaries.length === 0 ? (
            <p className="text-xs text-foreground/60">
              No link/owner mappings in this save — nothing to pre-resolve. Proceed to save.
            </p>
          ) : (
            <div className="space-y-4">
              {summaries.map((summary) => (
                <ObjectImpact key={summary.objectId} summary={summary} />
              ))}
            </div>
          )}
        </DialogPanel>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={isSaving}>
            Back to edit
          </Button>
          <Button onClick={onConfirm} disabled={loading || isSaving}>
            {isSaving ? (
              <>
                <RefreshCw className="size-3 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Check className="size-3.5" strokeWidth={3} /> Save and continue
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ObjectImpact({ summary }: { summary: ImpactSummary }) {
  return (
    <div className="border-2 border-foreground/10 p-3">
      <div className="text-xs font-bold uppercase tracking-wider mb-2">
        {summary.objectId} · {summary.sampleSize} sample{summary.sampleSize === 1 ? '' : 's'}
      </div>
      {summary.byField.length === 0 ? (
        <div className="text-[11px] text-foreground/50">No linkable fields to preview.</div>
      ) : (
        <ul className="space-y-1.5 text-xs">
          {summary.byField.map((f) => (
            <li key={f.fieldId} className="flex flex-wrap items-center gap-2">
              <span className="font-semibold min-w-[140px] truncate">{f.fieldLabel}</span>
              {f.matched > 0 ? (
                <span className="inline-flex items-center gap-1 text-success">
                  <Check className="size-3" strokeWidth={3} /> {f.matched} will match
                </span>
              ) : null}
              {f.created > 0 ? (
                <span className="inline-flex items-center gap-1 text-primary">
                  <Plus className="size-3" /> {f.created} will be created
                </span>
              ) : null}
              {f.null > 0 ? (
                <span className="text-foreground/50">{f.null} will be null</span>
              ) : null}
              {f.errors > 0 ? (
                <span className="inline-flex items-center gap-1 text-destructive">
                  <AlertTriangle className="size-3" /> {f.errors} errors
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
