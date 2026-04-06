import React from 'react'
import { Box, Text } from 'ink'

interface BarChartProps {
  value: number
  maxValue: number
  width?: number
  color?: string
  label?: string
  showValue?: boolean
}

export default function BarChart({
  value,
  maxValue,
  width = 20,
  color = 'green',
  label,
  showValue = true,
}: BarChartProps) {
  const ratio = maxValue > 0 ? Math.min(value / maxValue, 1) : 0
  const filled = Math.round(ratio * width)
  const empty = width - filled

  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(empty)

  return (
    <Box>
      {label && <Text>{label} </Text>}
      <Text color={color}>{bar}</Text>
      {showValue && <Text> {value}</Text>}
    </Box>
  )
}

interface HorizontalBarsProps {
  items: Array<{
    label: string
    value: number
    color?: string
  }>
  width?: number
  labelWidth?: number
}

export function HorizontalBars({ items, width = 30, labelWidth = 8 }: HorizontalBarsProps) {
  const maxValue = Math.max(...items.map((i) => i.value), 1)

  return (
    <Box flexDirection="column">
      {items.map((item, index) => {
        const ratio = item.value / maxValue
        const filled = Math.round(ratio * width)
        const empty = width - filled
        const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(empty)
        const paddedLabel = item.label.padEnd(labelWidth).slice(0, labelWidth)

        return (
          <Box key={index}>
            <Text dimColor>{paddedLabel} </Text>
            <Text color={item.color || 'green'}>{bar}</Text>
            <Text> {item.value}</Text>
          </Box>
        )
      })}
    </Box>
  )
}
