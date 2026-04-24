'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  autocomplete,
  FORMULA_FN_LIST,
  isBareStringLiteral,
} from '@/lib/formula'
import { BETON_PROPERTIES } from '@/lib/field-mapping/client'
import { evalSource } from '@/lib/field-mapping/client'
import type { FieldSchema, ObjectId, SampleSubject, Source } from '@/lib/field-mapping/client'

type Tab = 'option' | 'property' | 'formula' | 'link'

interface SourcePickerProps {
  field: FieldSchema
  subject: SampleSubject | null
  existing: Source
  onPick: (src: Source) => void
  children: ReactNode
}

const POSTHOG_PERSON_PROPS = [
  { id: 'email', label: 'email', kind: 'email' },
  { id: 'name', label: 'name', kind: 'text' },
  { id: 'first_name', label: 'first_name', kind: 'text' },
  { id: 'last_name', label: 'last_name', kind: 'text' },
  { id: 'job_title', label: 'job_title', kind: 'text' },
  { id: 'phone', label: 'phone', kind: 'phone' },
  { id: 'city', label: 'city', kind: 'text' },
  { id: 'country', label: 'country', kind: 'text' },
  { id: 'first_seen', label: 'first_seen', kind: 'datetime' },
  { id: 'last_seen', label: 'last_seen', kind: 'datetime' },
  { id: 'sessions_7d', label: 'sessions_7d', kind: 'number' },
  { id: 'sessions_30d', label: 'sessions_30d', kind: 'number' },
  { id: 'plan', label: 'plan', kind: 'text' },
  { id: 'activation_score', label: 'activation_score', kind: 'number' },
]

const POSTHOG_GROUP_PROPS = [
  { id: 'name', label: 'name', kind: 'text' },
  { id: 'domain', label: 'domain', kind: 'domain' },
  { id: 'plan', label: 'plan', kind: 'text' },
  { id: 'seat_count', label: 'seat_count', kind: 'number' },
  { id: 'mau_30d', label: 'mau_30d', kind: 'number' },
  { id: 'events_30d', label: 'events_30d', kind: 'number' },
  { id: 'trial_ends_at', label: 'trial_ends_at', kind: 'datetime' },
  { id: 'industry', label: 'industry', kind: 'text' },
  { id: 'country', label: 'country', kind: 'text' },
  { id: 'activation_score', label: 'activation_score', kind: 'number' },
  { id: 'mrr', label: 'mrr', kind: 'number' },
]

const LINKABLE_KINDS = new Set(['record', 'ref', 'actor'])

export function SourcePicker({
  field,
  subject,
  existing,
  onPick,
  children,
}: SourcePickerProps) {
  const hasOptions =
    (field.kind === 'select' || field.kind === 'multiselect' || field.kind === 'multi-select') &&
    Array.isArray(field.options) &&
    field.options.length > 0

  const isLinkable = LINKABLE_KINDS.has(field.kind)
  const isActor = field.kind === 'actor'
  const isRecord = field.kind === 'record' || field.kind === 'ref'

  const initialTab: Tab = (() => {
    if (existing?.type === 'formula') return 'formula'
    if (existing?.type === 'option') return 'option'
    if (
      existing?.type === 'link_subject_person' ||
      existing?.type === 'link_subject_company_by_domain' ||
      existing?.type === 'link_subject_company_via_person' ||
      existing?.type === 'link_specific_record' ||
      existing?.type === 'actor_subject_email' ||
      existing?.type === 'actor_account_owner'
    ) {
      return 'link'
    }
    if (isLinkable) return 'link'
    if (hasOptions) return 'option'
    return 'property'
  })()

  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>(initialTab)
  const [propQ, setPropQ] = useState('')
  const [optQ, setOptQ] = useState('')
  const [formula, setFormula] = useState(
    existing?.type === 'formula' ? existing.expr : existing?.type === 'option' ? `"${existing.value}"` : '',
  )
  const [caret, setCaret] = useState<number | null>(null)
  const formulaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!open) return
    setTab(initialTab)
    setPropQ('')
    setOptQ('')
    if (existing?.type === 'formula') setFormula(existing.expr)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const filteredProps = useMemo(() => {
    const s = propQ.trim().toLowerCase()
    const all: Array<{ id: string; label: string; kind: string; scope: 'person' | 'group_org' | 'beton_computed' }> = []
    POSTHOG_PERSON_PROPS.forEach((p) => all.push({ ...p, scope: 'person' }))
    POSTHOG_GROUP_PROPS.forEach((p) => all.push({ ...p, scope: 'group_org' }))
    BETON_PROPERTIES.forEach((p) => all.push({ ...p, scope: 'beton_computed' }))
    if (!s) return all
    return all.filter(
      (p) =>
        p.label.toLowerCase().includes(s) ||
        p.id.toLowerCase().includes(s) ||
        p.scope.includes(s),
    )
  }, [propQ])

  const autocompleteSuggestion = useMemo(() => {
    if (tab !== 'formula' || !formula) return null
    return autocomplete(formula, caret ?? formula.length, {
      properties: {
        person: POSTHOG_PERSON_PROPS,
        group: POSTHOG_GROUP_PROPS,
        beton: BETON_PROPERTIES,
      },
    })
  }, [tab, formula, caret])

  const commit = (src: Source) => {
    onPick(src)
    setOpen(false)
  }

  const insertInFormula = (text: string) => {
    const cur = formula
    const at = caret ?? cur.length
    const left = cur.slice(0, at)
    const right = cur.slice(at)
    const m = left.match(/(\w*)$/)
    const stripLen = m ? m[1].length : 0
    const newLeft = left.slice(0, left.length - stripLen) + text
    const next = newLeft + right
    setFormula(next)
    setTimeout(() => {
      const el = formulaRef.current
      if (el) {
        el.focus()
        el.setSelectionRange(newLeft.length, newLeft.length)
        setCaret(newLeft.length)
      }
    }, 0)
  }

  const previewText = useMemo(() => {
    if (tab !== 'formula' || !formula) return null
    const r = evalSource({ type: 'formula', expr: formula }, subject)
    return r
  }, [tab, formula, subject])

  const tabs = [
    hasOptions ? { v: 'option' as const, label: 'Option' } : null,
    isLinkable ? { v: 'link' as const, label: 'Link' } : null,
    { v: 'property' as const, label: 'Property' },
    { v: 'formula' as const, label: 'Formula' },
  ].filter(Boolean) as Array<{ v: Tab; label: string }>

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<span className="block w-full" />}>{children}</PopoverTrigger>
      <PopoverContent className="!p-0" viewportClassName="!p-0" side="bottom" align="start">
        <div className="w-[460px] max-w-[92vw] flex flex-col">
          {/* Tabs */}
          <div className="flex border-b-2 border-foreground/15">
            {tabs.map((t) => (
              <button
                key={t.v}
                type="button"
                onClick={() => setTab(t.v)}
                className={cn(
                  'flex-1 px-3 h-9 text-xs font-bold uppercase tracking-wider transition-colors',
                  tab === t.v
                    ? 'bg-background text-foreground shadow-[inset_0_-2px_0_var(--color-foreground)]'
                    : 'text-foreground/50 hover:text-foreground bg-muted/30',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Link tab — only for record-reference / actor-reference fields */}
          {tab === 'link' && isLinkable ? (
            <LinkTabContent
              field={field}
              isRecord={isRecord}
              isActor={isActor}
              existing={existing}
              subject={subject}
              onCommit={commit}
            />
          ) : null}

          {/* Option tab */}
          {tab === 'option' && hasOptions ? (
            <div className="flex flex-col">
              <div className="p-2 border-b-2 border-foreground/10">
                <Input
                  autoFocus
                  value={optQ}
                  onChange={(e) => setOptQ(e.target.value)}
                  placeholder={`Search ${field.label.toLowerCase()} options…`}
                />
              </div>
              <div className="max-h-[280px] overflow-y-auto">
                {(() => {
                  const s = optQ.trim().toLowerCase()
                  const shown = (field.options ?? []).filter((o) => !s || o.toLowerCase().includes(s))
                  if (shown.length === 0) {
                    return <div className="p-6 text-center text-xs text-foreground/50">No option matches "{optQ}"</div>
                  }
                  return shown.map((opt) => {
                    const selected = existing?.type === 'option' && existing.value === opt
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => commit({ type: 'option', value: opt })}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 h-8 text-xs hover:bg-foreground/5 text-left',
                          selected && 'bg-primary/10',
                        )}
                      >
                        <span className="w-4 h-4 border-2 border-foreground/20 inline-flex items-center justify-center shrink-0">
                          {selected ? <Check className="size-2.5" strokeWidth={4} /> : null}
                        </span>
                        <span className="font-mono">{opt}</span>
                      </button>
                    )
                  })
                })()}
              </div>
              <div className="border-t-2 border-foreground/10 px-3 py-2 text-[10px] text-foreground/50 bg-muted/30 flex items-center justify-between">
                <span>Send the same option on every record</span>
                <span>{(field.options ?? []).length} options</span>
              </div>
            </div>
          ) : null}

          {/* Property tab */}
          {tab === 'property' ? (
            <div className="flex flex-col">
              <div className="p-2 border-b-2 border-foreground/10">
                <Input
                  autoFocus
                  value={propQ}
                  onChange={(e) => setPropQ(e.target.value)}
                  placeholder="Search properties…"
                />
              </div>
              <div className="max-h-[320px] overflow-y-auto">
                {filteredProps.length === 0 ? (
                  <div className="p-6 text-center text-xs text-foreground/50">
                    No property matches "{propQ}"
                  </div>
                ) : null}
                {(['person', 'group_org', 'beton_computed'] as const).map((scope) => {
                  const group = filteredProps.filter((p) => p.scope === scope)
                  if (!group.length) return null
                  const label =
                    scope === 'person'
                      ? 'Person properties'
                      : scope === 'group_org'
                        ? 'Group (organization) properties'
                        : 'Beton-computed properties'
                  return (
                    <div key={scope}>
                      <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-foreground/40 font-bold">
                        {label}
                      </div>
                      {group.map((p) => {
                        const subjVal = subject?.props?.[p.id]
                        const hasVal = subjVal != null && subjVal !== ''
                        return (
                          <button
                            key={`${scope}.${p.id}`}
                            type="button"
                            onClick={() =>
                              commit({ type: 'property', prop: p.id, propKind: scope })
                            }
                            className="w-full grid grid-cols-[160px_60px_1fr] items-center gap-2 px-3 h-8 text-xs hover:bg-foreground/5 text-left"
                          >
                            <span className="font-mono truncate">{p.id}</span>
                            <span className="text-foreground/40 font-mono text-[10px] truncate">{p.kind}</span>
                            <span className="text-foreground/50 font-mono truncate">
                              {hasVal ? String(subjVal).slice(0, 40) : (
                                <span className="text-foreground/30 italic">empty</span>
                              )}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
              <div className="border-t-2 border-foreground/10 px-3 py-2 text-[10px] text-foreground/50 bg-muted/30 text-right">
                {filteredProps.length} properties
              </div>
            </div>
          ) : null}

          {/* Formula tab */}
          {tab === 'formula' ? (
            <div className="flex flex-col">
              <div className="p-3 space-y-2">
                <label className="text-[10px] uppercase tracking-wider font-bold text-foreground/50 block">
                  Formula or fixed value
                </label>
                <div className="relative">
                  <textarea
                    ref={formulaRef}
                    autoFocus
                    rows={3}
                    value={formula}
                    onChange={(e) => {
                      setFormula(e.target.value)
                      setCaret(e.target.selectionStart)
                    }}
                    onKeyUp={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart)}
                    onClick={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart)}
                    placeholder={`"Qualified"  —or—  concat(person.first_name, " ", person.last_name)`}
                    className="w-full border-2 border-foreground/20 focus:border-foreground focus:shadow-[2px_2px_0_var(--color-foreground)] bg-background p-2 font-mono text-xs outline-none resize-none"
                  />
                  {autocompleteSuggestion && autocompleteSuggestion.items.length ? (
                    <div className="absolute left-0 right-0 top-full mt-1 border-2 border-foreground bg-popover shadow-[4px_4px_0_var(--color-foreground)] z-10 max-h-[180px] overflow-y-auto">
                      <div className="px-3 py-1 text-[9px] uppercase tracking-wider text-foreground/40 font-bold bg-muted/40">
                        {autocompleteSuggestion.kind === 'prop'
                          ? `${autocompleteSuggestion.scope} properties`
                          : 'Functions'}
                      </div>
                      {autocompleteSuggestion.items.map((it) => (
                        <button
                          key={'id' in it ? it.id : it.name}
                          type="button"
                          onClick={() =>
                            insertInFormula('id' in it ? it.id : `${it.name}(`)
                          }
                          className="w-full text-left px-3 py-1 hover:bg-foreground/5 text-xs flex items-center gap-2 font-mono"
                        >
                          {'sig' in it ? (
                            <>
                              <span>{it.sig}</span>
                              <span className="ml-auto text-foreground/40 text-[10px]">{it.desc}</span>
                            </>
                          ) : (
                            <>
                              <span>{it.id}</span>
                              <span className="ml-auto text-foreground/40 text-[10px]">{it.kind}</span>
                            </>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <p className="text-[10px] text-foreground/50 leading-relaxed">
                  Type <code className="font-mono">person.</code>, <code className="font-mono">group.</code>, or{' '}
                  <code className="font-mono">beton.</code> to reference a property, or wrap a literal in
                  quotes (e.g. <code className="font-mono">"Qualified"</code>) for a fixed value.
                </p>
                <div className="flex items-center gap-2 text-[11px] pt-1">
                  <span className="text-foreground/50">Preview:</span>
                  {formula && previewText ? (
                    previewText.ok ? (
                      <span className="font-mono px-1.5 h-5 border bg-success/10 border-success/40 inline-flex items-center">
                        {previewText.text}
                      </span>
                    ) : (
                      <span className="font-mono text-warning">{previewText.reason}</span>
                    )
                  ) : (
                    <span className="text-foreground/30 italic">type to preview</span>
                  )}
                </div>
              </div>
              <div className="border-t-2 border-foreground/10 px-3 py-2 flex justify-between items-center gap-2">
                <span className="text-[10px] text-foreground/50">
                  {FORMULA_FN_LIST.length} functions available
                </span>
                <div className="flex gap-2">
                  <Button variant="ghost" size="xs" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      if (isBareStringLiteral(formula)) {
                        // Preserve bare-string-literal shape; engine handles it.
                      }
                      commit({ type: 'formula', expr: formula })
                    }}
                    disabled={!formula.trim()}
                  >
                    Save
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Link tab — renders inside the SourcePicker for record/actor fields
// ─────────────────────────────────────────────────────────────────────────
interface LinkTabContentProps {
  field: FieldSchema
  isRecord: boolean
  isActor: boolean
  existing: Source
  subject: SampleSubject | null
  onCommit: (src: Source) => void
}

interface RecordSearchResult {
  id: string
  display: string
  secondary?: string
}

function LinkTabContent({
  field,
  isRecord,
  isActor,
  existing,
  onCommit,
}: LinkTabContentProps) {
  const target = field.targetObjectId
  const selectedType = existing?.type

  // Record-reference options, filtered by target object type.
  const recordOptions: Array<{ type: Source['type']; label: string; hint: string }> = []
  if (isRecord) {
    if (target === 'people') {
      recordOptions.push({
        type: 'link_subject_person',
        label: "Subject's Person (by email)",
        hint: "Looks up an Attio Person by the subject's email. Creates one if missing.",
      })
    }
    if (target === 'companies') {
      recordOptions.push({
        type: 'link_subject_company_by_domain',
        label: "Subject's Company (by domain)",
        hint: "Derives the domain from the subject's email. Creates the Company if missing.",
      })
      recordOptions.push({
        type: 'link_subject_company_via_person',
        label: "Subject's Company (via Person.company)",
        hint: 'Asserts the Person first, then reads its linked Company.',
      })
    }
    // Always allow picking a specific record — handled separately below.
  }

  const actorOptions: Array<{ type: Source['type']; label: string; hint: string; disabled?: boolean }> = []
  if (isActor) {
    actorOptions.push({
      type: 'actor_subject_email',
      label: "Subject's email",
      hint: 'Sets the owner to the subject\'s email — only resolves if that email matches a workspace member.',
    })
    actorOptions.push({
      type: 'actor_account_owner',
      label: "Account owner's email",
      hint: 'Uses accounts.owner_email for this subject. Disabled if unset.',
    })
  }

  // Specific-record search state
  const [q, setQ] = useState('')
  const [results, setResults] = useState<RecordSearchResult[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (!isRecord || !target) return
    const trimmed = q.trim()
    if (trimmed.length < 2) {
      setResults([])
      return
    }
    let cancelled = false
    setSearching(true)
    fetch(`/api/integrations/attio/records/search?objectId=${target}&q=${encodeURIComponent(trimmed)}`)
      .then((r) => r.ok ? r.json() : { results: [] })
      .then((data) => {
        if (cancelled) return
        setResults(Array.isArray(data?.results) ? data.results : [])
      })
      .catch(() => {
        if (cancelled) return
        setResults([])
      })
      .finally(() => {
        if (!cancelled) setSearching(false)
      })
    return () => {
      cancelled = true
    }
  }, [q, isRecord, target])

  return (
    <div className="flex flex-col">
      <div className="p-4 space-y-3">
        {isRecord && !target ? (
          <div className="text-xs text-warning">
            This field doesn't declare a target object type. Use Formula to supply a specific record ID.
          </div>
        ) : null}

        {recordOptions.map((opt) => (
          <LinkOptionRow
            key={opt.type}
            selected={selectedType === opt.type}
            label={opt.label}
            hint={opt.hint}
            onClick={() => onCommit({ type: opt.type } as Source)}
          />
        ))}

        {actorOptions.map((opt) => (
          <LinkOptionRow
            key={opt.type}
            selected={selectedType === opt.type}
            label={opt.label}
            hint={opt.hint}
            onClick={() => onCommit({ type: opt.type } as Source)}
          />
        ))}

        {isRecord && target ? (
          <div className="border-t border-foreground/10 pt-3 space-y-2">
            <label className="text-[10px] uppercase tracking-wider font-bold text-foreground/50 block">
              Pick a specific {target.slice(0, -1)}
            </label>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search ${target}…`}
            />
            {q.trim().length >= 2 ? (
              <div className="border-2 border-foreground/15 max-h-[200px] overflow-y-auto">
                {searching ? (
                  <div className="px-3 py-2 text-xs text-foreground/50">Searching…</div>
                ) : results.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-foreground/50">No matches.</div>
                ) : (
                  results.map((r) => {
                    const selected =
                      existing?.type === 'link_specific_record' &&
                      existing.recordId === r.id
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() =>
                          onCommit({
                            type: 'link_specific_record',
                            targetObject: target as ObjectId,
                            recordId: r.id,
                          })
                        }
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-foreground/5 text-left',
                          selected && 'bg-primary/10',
                        )}
                      >
                        <span className="font-semibold truncate">{r.display}</span>
                        {r.secondary ? (
                          <span className="font-mono text-[10px] text-foreground/50 truncate">
                            {r.secondary}
                          </span>
                        ) : null}
                      </button>
                    )
                  })
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {isActor ? (
          <p className="text-[10px] text-foreground/50 leading-relaxed pt-2">
            For anything more custom (conditional routing, static email), switch to the{' '}
            <strong>Formula</strong> tab and use <code className="font-mono">member(&quot;…&quot;)</code>.
          </p>
        ) : null}
      </div>
    </div>
  )
}

function LinkOptionRow({
  label,
  hint,
  selected,
  onClick,
}: {
  label: string
  hint: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2 border-2 transition-colors',
        selected
          ? 'border-foreground bg-primary/5'
          : 'border-foreground/15 hover:border-foreground/40 bg-background',
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'w-3 h-3 rounded-full border-2 shrink-0',
            selected ? 'border-foreground bg-primary' : 'border-foreground/30',
          )}
        />
        <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-[11px] text-foreground/60 mt-1 ml-5">{hint}</p>
    </button>
  )
}
