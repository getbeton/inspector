'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type {
  Destination,
  MappingRow,
  ObjectId,
  ObjectSchema,
  SampleSubject,
  Source,
} from '@/lib/field-mapping'
import { saveFieldMappings } from './api'

/**
 * Global store for the Field Mapping page.
 *
 * Mirrors the prototype's StoreProvider: keeps current mappings, savedMappings,
 * subject choice per object, toasts, and history. Persists dirty edits to
 * localStorage so refresh preserves work-in-progress.
 */

interface StoreState {
  savedMappings: Record<ObjectId, MappingRow[]>
  mappings: Record<ObjectId, MappingRow[]>
  subjectByObj: Partial<Record<ObjectId, string>>
  objects: ObjectSchema[]
  subjects: Partial<Record<ObjectId, SampleSubject[]>>
}

interface StoreActions {
  setRowSource: (objectId: ObjectId, fieldId: string, source: Source) => void
  clearRowSource: (objectId: ObjectId, fieldId: string) => void
  addRow: (objectId: ObjectId, fieldId: string) => void
  removeRow: (objectId: ObjectId, fieldId: string) => void
  setSubject: (objectId: ObjectId, subjectId: string) => void
  setSubjects: (objectId: ObjectId, subjects: SampleSubject[]) => void
  saveAll: () => Promise<void>
  discardAll: () => void
}

interface StoreDerived {
  destination: Destination
  dirtyByObj: Record<ObjectId, number>
  dirtyCount: number
  isSaving: boolean
  saveError: string | null
}

const EMPTY_MAPPINGS: Record<ObjectId, MappingRow[]> = {
  deals: [],
  people: [],
  companies: [],
  workspaces: [],
}

const StoreCtx = createContext<(StoreState & StoreActions & StoreDerived) | null>(null)

interface ProviderProps {
  destination: Destination
  initialObjects: ObjectSchema[]
  initialMappings: Record<ObjectId, MappingRow[]>
  workspaceId: string
  children: ReactNode
}

export function FieldMappingStoreProvider({
  destination,
  initialObjects,
  initialMappings,
  workspaceId,
  children,
}: ProviderProps) {
  const lsKey = `beton-field-mapping-v2:${workspaceId}:${destination}`

  const [mappings, setMappings] = useState<Record<ObjectId, MappingRow[]>>(() => {
    if (typeof window === 'undefined') return withDefaults(initialMappings)
    try {
      const raw = window.localStorage.getItem(lsKey)
      if (raw) {
        const parsed = JSON.parse(raw) as { mappings?: Record<ObjectId, MappingRow[]> }
        if (parsed?.mappings) return withDefaults(parsed.mappings)
      }
    } catch {}
    return withDefaults(initialMappings)
  })

  const [savedMappings, setSavedMappings] = useState<Record<ObjectId, MappingRow[]>>(
    withDefaults(initialMappings),
  )
  const [subjectByObj, setSubjectByObj] = useState<Partial<Record<ObjectId, string>>>({})
  const [subjects, setSubjectsState] = useState<Partial<Record<ObjectId, SampleSubject[]>>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Persist dirty edits whenever mappings change
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(lsKey, JSON.stringify({ mappings }))
    } catch {}
  }, [mappings, lsKey])

  // ── derivations ─────────────────────────────────────────────
  const dirtyByObj = useMemo<Record<ObjectId, number>>(() => {
    const out: Record<ObjectId, number> = { deals: 0, people: 0, companies: 0, workspaces: 0 }
    for (const objId of Object.keys(mappings) as ObjectId[]) {
      const now = mappings[objId] ?? []
      const saved = savedMappings[objId] ?? []
      const savedByField = new Map(saved.map((r) => [r.fieldId, r]))
      let diff = 0
      for (const r of now) {
        const s = savedByField.get(r.fieldId)
        if (!s || JSON.stringify(s.source) !== JSON.stringify(r.source)) diff++
      }
      // Count removed rows that existed saved
      const nowByField = new Set(now.map((r) => r.fieldId))
      for (const s of saved) {
        if (!nowByField.has(s.fieldId)) diff++
      }
      out[objId] = diff
    }
    return out
  }, [mappings, savedMappings])

  const dirtyCount = useMemo(
    () => Object.values(dirtyByObj).reduce((a, b) => a + b, 0),
    [dirtyByObj],
  )

  // ── actions ─────────────────────────────────────────────────
  const setRowSource = useCallback(
    (objectId: ObjectId, fieldId: string, source: Source) => {
      setMappings((prev) => {
        const list = prev[objectId] ?? []
        let found = false
        const next = list.map((r) => {
          if (r.fieldId === fieldId) {
            found = true
            return { ...r, source }
          }
          return r
        })
        if (!found) next.push({ fieldId, source })
        return { ...prev, [objectId]: next }
      })
    },
    [],
  )

  const clearRowSource = useCallback(
    (objectId: ObjectId, fieldId: string) => {
      setRowSource(objectId, fieldId, { type: 'none' })
    },
    [setRowSource],
  )

  const addRow = useCallback((objectId: ObjectId, fieldId: string) => {
    setMappings((prev) => {
      const list = prev[objectId] ?? []
      if (list.some((r) => r.fieldId === fieldId)) return prev
      return { ...prev, [objectId]: [...list, { fieldId, source: { type: 'none' } }] }
    })
  }, [])

  const removeRow = useCallback((objectId: ObjectId, fieldId: string) => {
    setMappings((prev) => ({
      ...prev,
      [objectId]: (prev[objectId] ?? []).filter((r) => r.fieldId !== fieldId),
    }))
  }, [])

  const setSubject = useCallback((objectId: ObjectId, subjectId: string) => {
    setSubjectByObj((prev) => ({ ...prev, [objectId]: subjectId }))
  }, [])

  const setSubjects = useCallback((objectId: ObjectId, subjects: SampleSubject[]) => {
    setSubjectsState((prev) => ({ ...prev, [objectId]: subjects }))
  }, [])

  const saveAll = useCallback(async () => {
    if (dirtyCount === 0) return
    setIsSaving(true)
    setSaveError(null)
    try {
      // Exclude none-typed rows since the DB table requires either a typed source
      // or the row to be absent. Keep the UI's ability to show unmapped fields.
      const trimmed = trimNoneRows(mappings)
      await saveFieldMappings(destination, trimmed)
      setSavedMappings(trimmed)
      setMappings(trimmed)
      try {
        window.localStorage.removeItem(lsKey)
      } catch {}
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }, [destination, dirtyCount, lsKey, mappings])

  const discardAll = useCallback(() => {
    setMappings(savedMappings)
    setSaveError(null)
    try {
      window.localStorage.removeItem(lsKey)
    } catch {}
  }, [savedMappings, lsKey])

  const value = useMemo(
    () => ({
      destination,
      objects: initialObjects,
      mappings,
      savedMappings,
      subjectByObj,
      subjects,
      dirtyByObj,
      dirtyCount,
      isSaving,
      saveError,
      setRowSource,
      clearRowSource,
      addRow,
      removeRow,
      setSubject,
      setSubjects,
      saveAll,
      discardAll,
    }),
    [
      destination,
      initialObjects,
      mappings,
      savedMappings,
      subjectByObj,
      subjects,
      dirtyByObj,
      dirtyCount,
      isSaving,
      saveError,
      setRowSource,
      clearRowSource,
      addRow,
      removeRow,
      setSubject,
      setSubjects,
      saveAll,
      discardAll,
    ],
  )

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}

export function useFieldMappingStore() {
  const ctx = useContext(StoreCtx)
  if (!ctx) throw new Error('useFieldMappingStore must be used inside FieldMappingStoreProvider')
  return ctx
}

function withDefaults(m: Partial<Record<ObjectId, MappingRow[]>>): Record<ObjectId, MappingRow[]> {
  return { ...EMPTY_MAPPINGS, ...m }
}

function trimNoneRows(m: Record<ObjectId, MappingRow[]>): Record<ObjectId, MappingRow[]> {
  const out: Record<ObjectId, MappingRow[]> = { deals: [], people: [], companies: [], workspaces: [] }
  for (const k of Object.keys(m) as ObjectId[]) {
    out[k] = (m[k] ?? []).filter((r) => r.source && r.source.type !== 'none')
  }
  return out
}
