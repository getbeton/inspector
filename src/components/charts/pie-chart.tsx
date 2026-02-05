'use client'

import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

interface PieChartDataPoint {
  name: string
  value: number
  color?: string
  [key: string]: string | number | undefined
}

interface PieChartProps {
  data: PieChartDataPoint[]
  height?: number
  showLegend?: boolean
  showLabels?: boolean
  innerRadius?: number
  colors?: string[]
  formatValue?: (value: number) => string
}

const DEFAULT_COLORS = [
  'hsl(var(--signal-blue))',
  'hsl(var(--signal-teal))',
  'hsl(var(--signal-amber))',
  'hsl(var(--signal-orange))',
  'hsl(var(--signal-pink))',
  'hsl(var(--signal-neutral))',
]

export function PieChart({
  data,
  height = 200,
  showLegend = true,
  showLabels = false,
  innerRadius = 0,
  colors = DEFAULT_COLORS,
  formatValue = (v) => v.toLocaleString(),
}: PieChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsPieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={innerRadius}
          outerRadius="80%"
          paddingAngle={2}
          label={
            showLabels
              ? ({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
              : false
          }
          labelLine={showLabels}
        >
          {data.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={entry.color || colors[index % colors.length]}
            />
          ))}
        </Pie>
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const data = payload[0].payload
            const percentage = ((data.value / total) * 100).toFixed(1)
            return (
              <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg">
                <p className="text-sm font-medium">{data.name}</p>
                <p className="text-lg font-bold">{formatValue(data.value)}</p>
                <p className="text-xs text-muted-foreground">{percentage}%</p>
              </div>
            )
          }}
        />
        {showLegend && (
          <Legend
            verticalAlign="bottom"
            height={36}
            formatter={(value) => (
              <span className="text-sm text-foreground">{value}</span>
            )}
          />
        )}
      </RechartsPieChart>
    </ResponsiveContainer>
  )
}

// Donut chart is just a PieChart with innerRadius
export function DonutChart(props: Omit<PieChartProps, 'innerRadius'>) {
  return <PieChart {...props} innerRadius={60} />
}
