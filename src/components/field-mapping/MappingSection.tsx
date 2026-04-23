'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, ChevronRight, Play, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptySourceTrigger, PreviewPill, SourcePill } from './pills'
import { SourcePicker } from './SourcePicker'
import { SubjectPicker } from './SubjectPicker'
import { FieldPicker } from './FieldPicker'
import { fetchSampleSubjects } from './api'
import { useFieldMappingStore } from './store'
import type {
  Destination,
  FieldSchema,
  MappingRow,
  ObjectSchema,
  SampleSubject,
} from '@/lib/field-mapping'

interface MappingSectionProps {
  objectSchema: ObjectSchema
  destination: Destination
  onTest: (objectId: ObjectSchema['id']) => void
}

export function MappingSection({ objectSchema, destination, onTest }: MappingSectionProps) {
  const {
    mappings,
    savedMappings,
    subjectByObj,
    subjects,
    setSubject,
    setSubjects,
    setRowSource,
    clearRowSource,
    addRow,
    removeRow,
    dirtyByObj,
  } = useFieldMappingStore()

  const [collapsed, setCollapsed] = useState(false)
  const rows = mappings[objectSchema.id] ?? []
  const saved = savedMappings[objectSchema.id] ?? []
  const loadedSubjects = subjects[objectSchema.id] ?? []
  const subjectId = subjectByObj[objectSchema.id] ?? loadedSubjects[0]?.id ?? null
  const subject = loadedSubjects.find((s) => s.id === subjectId) ?? loadedSubjects[0] ?? null

  useEffect(() => {
    if (loadedSubjects.length > 0) return
    let cancelled = false
    fetchSampleSubjects(destination, objectSchema.id, 10).then((s) => {
      if (!cancelled) setSubjects(objectSchema.id, s)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination, objectSchema.id])

  const mappedCount = rows.filter((r) => r.source && r.source.type !== 'none').length
  const totalFields = objectSchema.fields.length
  const takenIds = useMemo(() => new Set(rows.map((r) => r.fieldId)), [rows])

  const requiredMissing = useMemo(
    () =>
      objectSchema.fields.filter(
        (f) =>
          f.required &&
          !rows.find((r) => r.fieldId === f.id && r.source && r.source.type !== 'none'),
      ),
    [objectSchema, rows],
  )

  const visible = useMemo(() => {
    const out: Array<{ field: FieldSchema; row: MappingRow }> = []
    const seen = new Set<string>()
    for (const r of rows) {
      const field = objectSchema.fields.find((f) => f.id === r.fieldId)
      if (!field) continue
      out.push({ field, row: r })
      seen.add(r.fieldId)
    }
    for (const f of objectSchema.fields) {
      if (f.required && !seen.has(f.id)) {
        out.push({ field: f, row: { fieldId: f.id, source: { type: 'none' } } })
      }
    }
    return out
  }, [rows, objectSchema])

  const isDirty = (fieldId: string) => {
    const now = rows.find((r) => r.fieldId === fieldId)?.source ?? { type: 'none' }
    const was = saved.find((r) => r.fieldId === fieldId)?.source ?? { type: 'none' }
    return JSON.stringify(now) !== JSON.stringify(was)
  }

  const dirty = dirtyByObj[objectSchema.id] ?? 0

  return (
    <div className="border-2 border-foreground/20 bg-card shadow-[4px_4px_0_var(--color-foreground)]">
      {/* Header */}
      <div className="border-b-2 border-foreground/10">
        <div className="px-5 py-3 flex items-center gap-4">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="p-1 text-foreground/50 hover:text-foreground shrink-0"
            aria-label={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-heading uppercase tracking-wider text-lg">{objectSchema.label}</h2>
            <div className="flex items-center gap-x-3 gap-y-1 text-[11px] text-foreground/60 mt-1 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <span className="font-bold text-foreground">{mappedCount}</span>
                <span className="text-foreground/50">of {totalFields} fields mapped</span>
              </span>
              <span className="text-foreground/30">·</span>
              {requiredMissing.length ? (
                <span className="inline-flex items-center gap-1 text-destructive">
                  <AlertTriangle className="size-3" /> {requiredMissing.length} required missing
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-success">
                  <Check className="size-3" strokeWidth={3} /> Required fields complete
                </span>
              )}
              {dirty ? (
                <>
                  <span className="text-foreground/30">·</span>
                  <span className="inline-flex items-center gap-1 text-foreground">
                    <span className="size-1.5 rounded-full bg-destructive" />
                    {dirty} unsaved
                  </span>
                </>
              ) : null}
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-foreground/50 font-bold whitespace-nowrap">
              Test with
            </span>
            {loadedSubjects.length > 0 ? (
              <SubjectPicker
                subjects={loadedSubjects}
                currentId={subjectId}
                onPick={(id) => setSubject(objectSchema.id, id)}
                subjectNoun={objectSchema.subjectKind === 'person' ? 'person' : 'organization'}
              />
            ) : (
              <span className="text-[10px] text-foreground/40 italic">loading…</span>
            )}
            <Button size="sm" variant="outline" onClick={() => onTest(objectSchema.id)}>
              <Play className="size-3" fill="currentColor" /> Send test
            </Button>
          </div>
        </div>
      </div>

      {!collapsed ? (
        <>
          {/* Column header */}
          <div className="grid grid-cols-[minmax(180px,240px)_340px_minmax(0,1fr)_32px] gap-3 px-5 py-2 border-b-2 border-foreground/15 bg-muted/30 text-[10px] uppercase tracking-wider font-bold text-foreground/50">
            <div>Destination field</div>
            <div>Source</div>
            <div>Value for {subject?.name ?? 'subject'}</div>
            <div />
          </div>

          {visible.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-foreground/50">
              No fields mapped yet.
            </div>
          ) : (
            <>
              {visible.map(({ field, row }) => {
                const missingReq = field.required && (!row.source || row.source.type === 'none')
                const rowDirty = isDirty(field.id)
                return (
                  <div
                    key={field.id}
                    className={cn(
                      'grid grid-cols-[minmax(180px,240px)_340px_minmax(0,1fr)_32px] gap-3 px-5 py-2 items-center border-b border-foreground/10 group',
                      rowDirty && 'bg-warning/10',
                      missingReq && 'bg-destructive/5',
                    )}
                  >
                    {/* Field cell */}
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-sm truncate">{field.label}</span>
                          {field.required ? (
                            <span className="text-destructive text-xs" title="Required">
                              *
                            </span>
                          ) : null}
                        </div>
                        <div className="text-[10px] text-foreground/40 font-mono">
                          {field.kind}
                          {field.recordHint ? ` · → ${field.recordHint}` : ''}
                        </div>
                      </div>
                    </div>

                    {/* Source cell */}
                    <div className="min-w-0 flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <SourcePicker
                          field={field}
                          subject={subject}
                          existing={row.source}
                          onPick={(src) => setRowSource(objectSchema.id, field.id, src)}
                        >
                          {row.source && row.source.type !== 'none' ? (
                            <SourcePill source={row.source} onEdit={() => {}} />
                          ) : (
                            <EmptySourceTrigger onOpen={() => {}} />
                          )}
                        </SourcePicker>
                      </div>
                      {rowDirty ? (
                        <Badge className="!h-4 !px-1 !text-[9px] border-warning bg-warning/20 text-foreground">
                          Unsaved
                        </Badge>
                      ) : null}
                      {missingReq ? (
                        <Badge className="!h-4 !px-1 !text-[9px] border-destructive bg-destructive/10 text-destructive">
                          Required
                        </Badge>
                      ) : null}
                    </div>

                    {/* Preview */}
                    <div className="min-w-0 truncate">
                      <PreviewPill source={row.source} subject={subject} field={field} />
                    </div>

                    {/* Remove */}
                    <div className="flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        aria-label={field.required ? 'Clear' : 'Remove'}
                        onClick={() =>
                          field.required
                            ? clearRowSource(objectSchema.id, field.id)
                            : removeRow(objectSchema.id, field.id)
                        }
                        className="p-1 text-foreground/40 hover:text-destructive"
                        title={field.required ? 'Required field — clear only' : 'Remove this row'}
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}

              {/* Add field trigger */}
              <div className="px-5 py-2 border-b border-foreground/10 bg-muted/10">
                <FieldPicker
                  fields={objectSchema.fields}
                  takenIds={takenIds}
                  onPick={(fid) => addRow(objectSchema.id, fid)}
                  trigger={
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 h-7 px-2 text-xs text-foreground/60 hover:text-foreground border-2 border-dashed border-foreground/20 hover:border-foreground bg-transparent hover:bg-background transition-colors"
                    >
                      <Plus className="size-3.5" />
                      <span>Add field…</span>
                      <span className="text-foreground/40 ml-1">
                        {totalFields - takenIds.size} available
                      </span>
                    </button>
                  }
                />
              </div>
            </>
          )}
        </>
      ) : null}
    </div>
  )
}
