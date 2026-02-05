'use client'

import {
  AreaChart as RechartsAreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface DataPoint {
  name: string
  value: number
  [key: string]: string | number
}

interface AreaChartProps {
  data: DataPoint[]
  dataKey?: string
  height?: number
  color?: string
  gradientId?: string
  showGrid?: boolean
  showAxis?: boolean
  formatValue?: (value: number) => string
}

export function AreaChart({
  data,
  dataKey = 'value',
  height = 200,
  color = 'hsl(var(--primary))',
  gradientId = 'areaGradient',
  showGrid = true,
  showAxis = true,
  formatValue = (v) => v.toLocaleString(),
}: AreaChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsAreaChart
        data={data}
        margin={{ top: 10, right: 10, left: showAxis ? 0 : -20, bottom: 0 }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {showGrid && (
          <CartesianGrid
            strokeDasharray="4 4"
            stroke="hsl(var(--border))"
            vertical={false}
          />
        )}
        {showAxis && (
          <>
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              dy={10}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              tickFormatter={formatValue}
              width={45}
            />
          </>
        )}
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            return (
              <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="text-lg font-bold text-primary">
                  {formatValue(payload[0].value as number)}
                </p>
              </div>
            )
          }}
        />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
        />
      </RechartsAreaChart>
    </ResponsiveContainer>
  )
}

// Multi-series area chart
interface MultiAreaChartProps {
  data: DataPoint[]
  series: {
    dataKey: string
    color: string
    name: string
  }[]
  height?: number
  showGrid?: boolean
  showAxis?: boolean
  formatValue?: (value: number) => string
}

export function MultiAreaChart({
  data,
  series,
  height = 200,
  showGrid = true,
  showAxis = true,
  formatValue = (v) => v.toLocaleString(),
}: MultiAreaChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsAreaChart
        data={data}
        margin={{ top: 10, right: 10, left: showAxis ? 0 : -20, bottom: 0 }}
      >
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.dataKey} id={`gradient-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={s.color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        {showGrid && (
          <CartesianGrid
            strokeDasharray="4 4"
            stroke="hsl(var(--border))"
            vertical={false}
          />
        )}
        {showAxis && (
          <>
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              dy={10}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              tickFormatter={formatValue}
              width={45}
            />
          </>
        )}
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            return (
              <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg">
                <p className="text-sm text-muted-foreground mb-1">{label}</p>
                {payload.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: p.color }}
                    />
                    <span className="text-sm">{p.name}:</span>
                    <span className="font-bold">{formatValue(p.value as number)}</span>
                  </div>
                ))}
              </div>
            )
          }}
        />
        {series.map((s, i) => (
          <Area
            key={s.dataKey}
            type="monotone"
            dataKey={s.dataKey}
            name={s.name}
            stroke={s.color}
            strokeWidth={2}
            fill={`url(#gradient-${i})`}
          />
        ))}
      </RechartsAreaChart>
    </ResponsiveContainer>
  )
}
