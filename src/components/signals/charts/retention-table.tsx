'use client'

import { CHART_COLORS, hexToRgba } from './palette'
import { cn } from '@/lib/utils/cn'

interface RetentionTableProps {
  signalValues: number[]
  nosignalValues: number[]
}

/**
 * Cohort retention heatmap table.
 * Two rows (signal vs no-signal) with M0-M8 columns, cells colored by value.
 */
export function RetentionTable({ signalValues, nosignalValues }: RetentionTableProps) {
  const months = Array.from({ length: Math.max(signalValues.length, nosignalValues.length) }, (_, i) => `M${i}`)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="text-left py-2 px-3 text-muted-foreground font-medium w-[140px]">Cohort</th>
            {months.map(m => (
              <th key={m} className="text-center py-2 px-2 text-muted-foreground font-medium min-w-[60px]">
                {m}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <RetentionRow
            label="With signal"
            color={CHART_COLORS.signal}
            values={signalValues}
          />
          <RetentionRow
            label="Without signal"
            color={CHART_COLORS.noSignal}
            values={nosignalValues}
          />
        </tbody>
      </table>
    </div>
  )
}

function RetentionRow({ label, color, values }: {
  label: string
  color: string
  values: number[]
}) {
  return (
    <tr>
      <td className="py-2 px-3 font-medium whitespace-nowrap" style={{ color }}>
        {label}
      </td>
      {values.map((val, i) => {
        const alpha = Math.max(0.04, (val / 100) * 0.35)
        const bg = hexToRgba(color, alpha)
        const textColor = val >= 100 ? '#e8e8e8' : undefined

        return (
          <td
            key={i}
            className="text-center py-2 px-2 font-mono text-xs"
            style={{ background: bg, color: textColor }}
          >
            {val}%
          </td>
        )
      })}
    </tr>
  )
}
