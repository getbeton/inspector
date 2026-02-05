'use client'

import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from 'recharts'

interface BarChartDataPoint {
  name: string
  value: number
  color?: string
  [key: string]: string | number | undefined
}

interface BarChartProps {
  data: BarChartDataPoint[]
  dataKey?: string
  height?: number
  color?: string
  showGrid?: boolean
  showAxis?: boolean
  layout?: 'horizontal' | 'vertical'
  formatValue?: (value: number) => string
}

export function BarChart({
  data,
  dataKey = 'value',
  height = 200,
  color = 'hsl(var(--primary))',
  showGrid = true,
  showAxis = true,
  layout = 'vertical',
  formatValue = (v) => v.toLocaleString(),
}: BarChartProps) {
  const isHorizontal = layout === 'horizontal'

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBarChart
        data={data}
        layout={layout}
        margin={{
          top: 10,
          right: 20,
          left: showAxis ? (isHorizontal ? 0 : 80) : 0,
          bottom: 10,
        }}
      >
        {showGrid && (
          <CartesianGrid
            strokeDasharray="4 4"
            stroke="hsl(var(--border))"
            horizontal={!isHorizontal}
            vertical={isHorizontal}
          />
        )}
        {showAxis && (
          <>
            <XAxis
              type={isHorizontal ? 'category' : 'number'}
              dataKey={isHorizontal ? 'name' : undefined}
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              tickFormatter={isHorizontal ? undefined : formatValue}
            />
            <YAxis
              type={isHorizontal ? 'number' : 'category'}
              dataKey={isHorizontal ? undefined : 'name'}
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              tickFormatter={isHorizontal ? formatValue : undefined}
              width={isHorizontal ? 45 : 80}
            />
          </>
        )}
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const data = payload[0].payload
            return (
              <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg">
                <p className="text-sm text-muted-foreground">{data.name}</p>
                <p className="text-lg font-bold text-primary">
                  {formatValue(data[dataKey] as number)}
                </p>
              </div>
            )
          }}
          cursor={{ fill: 'hsl(var(--muted) / 0.5)' }}
        />
        <Bar
          dataKey={dataKey}
          radius={isHorizontal ? [4, 4, 0, 0] : [0, 4, 4, 0]}
          maxBarSize={40}
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color || color} />
          ))}
        </Bar>
      </RechartsBarChart>
    </ResponsiveContainer>
  )
}

// Grouped bar chart for comparing multiple series
interface GroupedBarChartProps {
  data: BarChartDataPoint[]
  series: {
    dataKey: string
    color: string
    name: string
  }[]
  height?: number
  showGrid?: boolean
  showLegend?: boolean
  formatValue?: (value: number) => string
}

export function GroupedBarChart({
  data,
  series,
  height = 200,
  showGrid = true,
  showLegend = true,
  formatValue = (v) => v.toLocaleString(),
}: GroupedBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBarChart
        data={data}
        margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
      >
        {showGrid && (
          <CartesianGrid
            strokeDasharray="4 4"
            stroke="hsl(var(--border))"
            vertical={false}
          />
        )}
        <XAxis
          dataKey="name"
          axisLine={false}
          tickLine={false}
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
          tickFormatter={formatValue}
          width={45}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            return (
              <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg">
                <p className="text-sm text-muted-foreground mb-1">{label}</p>
                {payload.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-sm"
                      style={{ backgroundColor: p.color }}
                    />
                    <span className="text-sm">{p.name}:</span>
                    <span className="font-bold">{formatValue(p.value as number)}</span>
                  </div>
                ))}
              </div>
            )
          }}
          cursor={{ fill: 'hsl(var(--muted) / 0.5)' }}
        />
        {showLegend && (
          <Legend
            verticalAlign="top"
            height={36}
            formatter={(value) => (
              <span className="text-sm text-foreground">{value}</span>
            )}
          />
        )}
        {series.map((s) => (
          <Bar
            key={s.dataKey}
            dataKey={s.dataKey}
            name={s.name}
            fill={s.color}
            radius={[4, 4, 0, 0]}
            maxBarSize={30}
          />
        ))}
      </RechartsBarChart>
    </ResponsiveContainer>
  )
}
