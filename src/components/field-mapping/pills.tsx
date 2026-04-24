'use client'

import { AlertTriangle, ArrowRight, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { evalSource } from '@/lib/field-mapping/client'
import type { FieldSchema, SampleSubject, Source } from '@/lib/field-mapping/client'

/** Shared cell class so pill and empty trigger align perfectly in the grid. */
const CELL_CLS =
  'w-full h-8 px-2 inline-flex items-center gap-1.5 border-2 text-xs font-mono'

interface SourcePillProps {
  source: Source
  onEdit: () => void
}

export function SourcePill({ source, onEdit }: SourcePillProps) {
  if (!source || source.type === 'none') return null

  if (source.type === 'property') {
    return (
      <button
        type="button"
        onClick={onEdit}
        className={cn(
          CELL_CLS,
          'border-foreground/20 bg-background',
          'hover:border-foreground hover:shadow-[2px_2px_0_var(--color-foreground)] hover:-translate-x-px hover:-translate-y-px transition-all',
        )}
      >
        <span className="text-foreground/40 text-[10px] uppercase shrink-0">
          {source.propKind === 'person' ? 'person' : source.propKind === 'group_org' ? 'group' : 'beton'}.
        </span>
        <span className="font-semibold truncate">{source.prop}</span>
        {source.transform ? (
          <span className="text-foreground/50 text-[11px] shrink-0">{source.transform}</span>
        ) : null}
      </button>
    )
  }

  if (source.type === 'formula') {
    return (
      <button
        type="button"
        onClick={onEdit}
        className={cn(
          CELL_CLS,
          'border-foreground/20 bg-background',
          'hover:border-foreground hover:shadow-[2px_2px_0_var(--color-foreground)] hover:-translate-x-px hover:-translate-y-px transition-all',
        )}
      >
        <span className="truncate">{source.expr || 'empty formula'}</span>
      </button>
    )
  }

  if (source.type === 'option') {
    return (
      <button
        type="button"
        onClick={onEdit}
        className={cn(
          CELL_CLS,
          'border-foreground/20 bg-background',
          'hover:border-foreground hover:shadow-[2px_2px_0_var(--color-foreground)] hover:-translate-x-px hover:-translate-y-px transition-all',
        )}
      >
        <span className="text-foreground/40 text-[10px] uppercase shrink-0">option</span>
        <span className="font-semibold truncate">{source.value}</span>
      </button>
    )
  }

  // Entity-linking variants — compact chip describing resolution strategy
  if (
    source.type === 'link_subject_person' ||
    source.type === 'link_subject_company_by_domain' ||
    source.type === 'link_subject_company_via_person' ||
    source.type === 'link_specific_record' ||
    source.type === 'actor_subject_email' ||
    source.type === 'actor_account_owner'
  ) {
    const labelByType: Record<string, string> = {
      link_subject_person: "→ subject's Person",
      link_subject_company_by_domain: "→ Company by domain",
      link_subject_company_via_person: "→ Company via Person",
      link_specific_record: '→ pinned record',
      actor_subject_email: "→ subject's email as owner",
      actor_account_owner: '→ account.owner_email as owner',
    }
    const secondary =
      source.type === 'link_specific_record'
        ? `${source.targetObject}/${source.recordId.slice(0, 8)}…`
        : undefined
    return (
      <button
        type="button"
        onClick={onEdit}
        className={cn(
          CELL_CLS,
          'border-foreground/20 bg-background',
          'hover:border-foreground hover:shadow-[2px_2px_0_var(--color-foreground)] hover:-translate-x-px hover:-translate-y-px transition-all',
        )}
      >
        <span className="text-foreground/40 text-[10px] uppercase shrink-0">link</span>
        <span className="font-semibold truncate">{labelByType[source.type]}</span>
        {secondary ? (
          <span className="text-foreground/50 text-[10px] truncate">{secondary}</span>
        ) : null}
      </button>
    )
  }

  return null
}

interface EmptyTriggerProps {
  onOpen: () => void
}

export function EmptySourceTrigger({ onOpen }: EmptyTriggerProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        CELL_CLS,
        'border-dashed border-foreground/25 bg-transparent text-foreground/50',
        'hover:border-foreground hover:text-foreground hover:bg-background transition-colors',
      )}
      style={{
        backgroundImage:
          'repeating-linear-gradient(45deg, rgba(0,0,0,0.02) 0 6px, transparent 6px 12px)',
      }}
    >
      <Plus className="size-3.5 shrink-0" />
      <span>Pick a source…</span>
    </button>
  )
}

interface PreviewPillProps {
  source: Source
  subject: SampleSubject | null
  field: FieldSchema
}

export function PreviewPill({ source, subject }: PreviewPillProps) {
  if (!source || source.type === 'none') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-foreground/35 font-mono">
        <ArrowRight className="size-3" />
        <span>
          will send <code>null</code>
        </span>
      </span>
    )
  }

  const r = evalSource(source, subject)

  if (!r.ok) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-mono">
        <ArrowRight className="size-3 text-warning" />
        <span className="inline-flex items-center gap-1 px-1.5 h-5 bg-warning/30 border border-warning text-foreground">
          <AlertTriangle className="size-3" />
          {r.reason}
        </span>
      </span>
    )
  }

  const text = r.text ?? String(r.value)
  const truncated = text.length > 42 ? text.slice(0, 42) + '…' : text
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-mono">
      <ArrowRight className="size-3 text-foreground/40" />
      <span
        title={text}
        className="inline-flex items-center px-1.5 h-5 border bg-success/10 border-success/40 text-foreground"
      >
        {truncated}
      </span>
    </span>
  )
}
