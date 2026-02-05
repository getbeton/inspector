'use client'

import { cn } from '@/lib/utils/cn'

interface MiniSparklineProps {
  data: number[]
  width?: number
  height?: number
  color?: string
  className?: string
  showDot?: boolean
}

/**
 * Lightweight SVG sparkline for inline use in tables and cards.
 * Uses pure SVG instead of Recharts for minimal bundle impact.
 */
export function MiniSparkline({
  data,
  width = 60,
  height = 20,
  color,
  className,
  showDot = true,
}: MiniSparklineProps) {
  if (!data.length) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const padding = 2
  const chartWidth = width - padding * 2
  const chartHeight = height - padding * 2

  const points = data.map((value, i) => ({
    x: padding + (i / (data.length - 1)) * chartWidth,
    y: padding + (1 - (value - min) / range) * chartHeight,
  }))

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')

  // Determine trend color
  const isPositive = data[data.length - 1] >= data[0]
  const strokeColor = color || (isPositive ? 'hsl(var(--success))' : 'hsl(var(--destructive))')

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('inline-block', className)}
    >
      <path
        d={pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {showDot && points.length > 0 && (
        <circle
          cx={points[points.length - 1].x}
          cy={points[points.length - 1].y}
          r={2}
          fill={strokeColor}
        />
      )}
    </svg>
  )
}

interface SparkBarProps {
  data: number[]
  width?: number
  height?: number
  color?: string
  className?: string
}

/**
 * Mini bar chart sparkline for discrete data points.
 */
export function SparkBar({
  data,
  width = 60,
  height = 20,
  color = 'hsl(var(--primary))',
  className,
}: SparkBarProps) {
  if (!data.length) return null

  const max = Math.max(...data)
  const barWidth = (width - (data.length - 1) * 2) / data.length
  const padding = 2

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('inline-block', className)}
    >
      {data.map((value, i) => {
        const barHeight = (value / max) * (height - padding * 2)
        return (
          <rect
            key={i}
            x={i * (barWidth + 2)}
            y={height - padding - barHeight}
            width={barWidth}
            height={barHeight}
            fill={color}
            rx={1}
          />
        )
      })}
    </svg>
  )
}
