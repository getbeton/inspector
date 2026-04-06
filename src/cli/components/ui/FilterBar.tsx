import React from 'react'
import { Box, Text } from 'ink'

interface FilterBarProps {
  filters: Array<{
    label: string
    value: string
    active?: boolean
  }>
  searchQuery?: string
}

export default function FilterBar({ filters, searchQuery }: FilterBarProps) {
  return (
    <Box>
      <Text dimColor>Filters: </Text>
      {filters.map((filter, index) => (
        <Box key={index} marginRight={1}>
          <Text color={filter.active ? 'cyan' : 'gray'}>
            {filter.label}:{filter.value}
          </Text>
          {index < filters.length - 1 && <Text dimColor> | </Text>}
        </Box>
      ))}
      {searchQuery && (
        <Box marginLeft={2}>
          <Text dimColor>Search: </Text>
          <Text color="yellow">{searchQuery}</Text>
        </Box>
      )}
    </Box>
  )
}
