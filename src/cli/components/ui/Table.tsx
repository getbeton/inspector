import React from 'react'
import { Box, Text } from 'ink'

export interface TableColumn<T> {
  key: string
  header: string
  width?: number
  align?: 'left' | 'right'
  render?: (row: T) => string
  color?: (row: T) => string | undefined
}

interface TableProps<T> {
  columns: TableColumn<T>[]
  data: T[]
  selectedIndex?: number
  page?: number
  totalPages?: number
  emptyMessage?: string
}

function getCellValue<T>(row: T, col: TableColumn<T>): string {
  if (col.render) return col.render(row)
  const val = (row as Record<string, unknown>)[col.key]
  if (val === null || val === undefined) return '-'
  return String(val)
}

function padCell(value: string, width: number, align: 'left' | 'right' = 'left'): string {
  if (value.length >= width) return value.slice(0, width)
  if (align === 'right') return value.padStart(width)
  return value.padEnd(width)
}

export default function Table<T>({
  columns,
  data,
  selectedIndex,
  page,
  totalPages,
  emptyMessage = 'No data',
}: TableProps<T>) {
  const effectiveColumns = columns.map((col) => ({
    ...col,
    width: col.width || Math.max(col.header.length + 2, 10),
  }))

  // Header row
  const headerText = effectiveColumns
    .map((col) => padCell(col.header, col.width, col.align))
    .join('  ')

  // Separator
  const separator = effectiveColumns
    .map((col) => '\u2500'.repeat(col.width))
    .join('  ')

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">{headerText}</Text>
      <Text dimColor>{separator}</Text>

      {data.length === 0 ? (
        <Text dimColor>{emptyMessage}</Text>
      ) : (
        data.map((row, index) => {
          const isSelected = selectedIndex === index
          const rowText = effectiveColumns
            .map((col) => {
              const value = getCellValue(row, col)
              return padCell(value, col.width, col.align)
            })
            .join('  ')

          const rowColor = isSelected ? 'cyan' : undefined

          return (
            <Box key={index}>
              {isSelected && <Text color="cyan">{'\u25b6 '}</Text>}
              {!isSelected && <Text>{'  '}</Text>}
              <Text color={rowColor} inverse={isSelected}>
                {rowText}
              </Text>
            </Box>
          )
        })
      )}

      {page !== undefined && totalPages !== undefined && totalPages > 1 && (
        <Box marginTop={1}>
          <Text dimColor>
            Page {page}/{totalPages}  [n]ext  [p]rev
          </Text>
        </Box>
      )}
    </Box>
  )
}
