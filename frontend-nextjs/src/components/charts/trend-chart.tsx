'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

interface TrendChartProps {
  data: number[]
  labels?: string[]
  height?: number
  showAverage?: boolean
  formatValue?: (value: number) => string
  color?: string
}

export function TrendChart({
  data,
  labels,
  height = 200,
  showAverage = true,
  formatValue = (v) => `${(v * 100).toFixed(0)}%`,
  color = 'hsl(var(--primary))',
}: TrendChartProps) {
  const defaultLabels = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].slice(-data.length)
  const chartLabels = labels || defaultLabels

  const chartData = data.map((value, index) => ({
    name: chartLabels[index] || `Point ${index + 1}`,
    value,
    formattedValue: formatValue(value),
  }))

  const average = data.reduce((a, b) => a + b, 0) / data.length
  const min = Math.min(...data)
  const max = Math.max(...data)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        data={chartData}
        margin={{ top: 20, right: 20, left: 10, bottom: 10 }}
      >
        <CartesianGrid
          strokeDasharray="4 4"
          stroke="hsl(var(--border))"
          vertical={false}
        />
        <XAxis
          dataKey="name"
          axisLine={false}
          tickLine={false}
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
          dy={10}
        />
        <YAxis
          domain={[Math.max(0, min - 0.05), Math.min(1, max + 0.05)]}
          tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
          axisLine={false}
          tickLine={false}
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
          width={45}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const data = payload[0].payload
            return (
              <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg">
                <p className="text-sm font-medium">{data.name}</p>
                <p className="text-lg font-bold text-primary">
                  {data.formattedValue}
                </p>
              </div>
            )
          }}
        />
        {showAverage && (
          <ReferenceLine
            y={average}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="4 4"
            label={{
              value: `Avg: ${formatValue(average)}`,
              position: 'right',
              fill: 'hsl(var(--muted-foreground))',
              fontSize: 11,
            }}
          />
        )}
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={3}
          dot={{
            fill: color,
            strokeWidth: 0,
            r: 5,
          }}
          activeDot={{
            fill: color,
            strokeWidth: 2,
            stroke: 'hsl(var(--background))',
            r: 7,
          }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
