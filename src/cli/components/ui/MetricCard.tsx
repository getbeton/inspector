import React from 'react'
import { Box, Text } from 'ink'

interface MetricCardProps {
  label: string
  value: string
  sublabel?: string
  color?: string
  width?: number
}

export default function MetricCard({ label, value, sublabel, color, width = 16 }: MetricCardProps) {
  return (
    <Box
      flexDirection="column"
      width={width}
      borderStyle="single"
      paddingX={1}
    >
      <Text bold dimColor>{label}</Text>
      <Text color={color || 'white'} bold>{value}</Text>
      {sublabel && <Text dimColor>{sublabel}</Text>}
    </Box>
  )
}
