'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts'

interface ConversionChartProps {
  conversionWith: number
  conversionWithout: number
  sampleWith: number
  sampleWithout: number
  height?: number
  showLabels?: boolean
}

export function ConversionChart({
  conversionWith,
  conversionWithout,
  sampleWith,
  sampleWithout,
  height = 120,
  showLabels = true,
}: ConversionChartProps) {
  const data = [
    {
      name: 'With Signal',
      value: conversionWith * 100,
      sample: sampleWith,
      fill: 'hsl(var(--success))',
    },
    {
      name: 'Without Signal',
      value: conversionWithout * 100,
      sample: sampleWithout,
      fill: 'hsl(var(--muted-foreground) / 0.3)',
    },
  ]

  const maxValue = Math.max(conversionWith, conversionWithout) * 100

  return (
    <div className="space-y-1">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 10, right: 80, left: 100, bottom: 10 }}
          barCategoryGap="30%"
        >
          <XAxis
            type="number"
            domain={[0, Math.ceil(maxValue * 1.1)]}
            hide
          />
          <YAxis
            type="category"
            dataKey="name"
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'hsl(var(--foreground))', fontSize: 13, fontWeight: 500 }}
            width={95}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const data = payload[0].payload
              return (
                <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg">
                  <p className="text-sm font-medium">{data.name}</p>
                  <p className="text-lg font-bold">{data.value.toFixed(1)}%</p>
                  <p className="text-xs text-muted-foreground">
                    {data.sample.toLocaleString()} users
                  </p>
                </div>
              )
            }}
          />
          <Bar
            dataKey="value"
            radius={[0, 6, 6, 0]}
            maxBarSize={32}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
            {showLabels && (
              <LabelList
                dataKey="value"
                position="right"
                formatter={(v) => `${Number(v).toFixed(1)}%`}
                style={{
                  fill: 'hsl(var(--foreground))',
                  fontSize: 14,
                  fontWeight: 700,
                }}
              />
            )}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {showLabels && (
        <div className="flex justify-between text-xs text-muted-foreground px-1">
          <span>{sampleWith.toLocaleString()} users</span>
          <span>{sampleWithout.toLocaleString()} users</span>
        </div>
      )}
    </div>
  )
}

// Alternative stacked bar variant for comparing metrics
interface ComparisonBarProps {
  label: string
  value: number
  maxValue: number
  color?: string
  subtitle?: string
}

export function ComparisonBar({
  label,
  value,
  maxValue,
  color = 'hsl(var(--primary))',
  subtitle,
}: ComparisonBarProps) {
  const width = (value / maxValue) * 100

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        {subtitle && (
          <span className="text-sm text-muted-foreground">{subtitle}</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1 h-8 bg-muted rounded-md overflow-hidden">
          <div
            className="h-full transition-all duration-500 rounded-md"
            style={{ width: `${width}%`, backgroundColor: color }}
          />
        </div>
        <span className="text-lg font-bold w-16 text-right">
          {(value * 100).toFixed(1)}%
        </span>
      </div>
    </div>
  )
}
