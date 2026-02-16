'use client'

import { useTableColumns } from '@/lib/hooks/use-explorations'
import type { JoinPair } from '@/lib/api/explorations'

interface JoinPairRowProps {
  pair: JoinPair
  index: number
  tableIds: string[]
  workspaceId: string | undefined
  onChange: (index: number, updated: JoinPair) => void
  onRemove: (index: number) => void
  disabled?: boolean
}

export function JoinPairRow({
  pair,
  index,
  tableIds,
  workspaceId,
  onChange,
  onRemove,
  disabled,
}: JoinPairRowProps) {
  const { data: t1Columns } = useTableColumns(workspaceId, pair.table1 || undefined)
  const { data: t2Columns } = useTableColumns(workspaceId, pair.table2 || undefined)

  const selectClass =
    'h-7 rounded-md border border-input bg-background px-2 text-xs shadow-xs/5 disabled:opacity-50'

  return (
    <div className="flex items-center gap-2">
      <select
        value={pair.table1}
        onChange={(e) =>
          onChange(index, { ...pair, table1: e.target.value, col1: '' })
        }
        disabled={disabled}
        className={selectClass}
      >
        <option value="">Table 1</option>
        {tableIds.map((id) => (
          <option key={id} value={id}>{id}</option>
        ))}
      </select>

      <select
        value={pair.col1}
        onChange={(e) => onChange(index, { ...pair, col1: e.target.value })}
        disabled={disabled || !pair.table1}
        className={selectClass}
      >
        <option value="">Column</option>
        {t1Columns?.columns.map((c) => (
          <option key={c.name} value={c.name}>{c.name}</option>
        ))}
      </select>

      <span className="text-xs text-muted-foreground font-mono">=</span>

      <select
        value={pair.table2}
        onChange={(e) =>
          onChange(index, { ...pair, table2: e.target.value, col2: '' })
        }
        disabled={disabled}
        className={selectClass}
      >
        <option value="">Table 2</option>
        {tableIds.map((id) => (
          <option key={id} value={id}>{id}</option>
        ))}
      </select>

      <select
        value={pair.col2}
        onChange={(e) => onChange(index, { ...pair, col2: e.target.value })}
        disabled={disabled || !pair.table2}
        className={selectClass}
      >
        <option value="">Column</option>
        {t2Columns?.columns.map((c) => (
          <option key={c.name} value={c.name}>{c.name}</option>
        ))}
      </select>

      <button
        onClick={() => onRemove(index)}
        disabled={disabled}
        className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
        title="Remove join pair"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  )
}
