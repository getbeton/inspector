import React from 'react'
import { Text } from 'ink'

interface StatusBadgeProps {
  status: string
  label?: string
}

function getStatusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'active':
    case 'enabled':
    case 'connected':
    case 'completed':
      return 'green'
    case 'trial':
    case 'draft':
    case 'running':
    case 'pending':
      return 'yellow'
    case 'churned':
    case 'disabled':
    case 'failed':
    case 'error':
      return 'red'
    case 'inactive':
    case 'not connected':
      return 'gray'
    default:
      return 'white'
  }
}

function getStatusSymbol(status: string): string {
  switch (status.toLowerCase()) {
    case 'active':
    case 'enabled':
    case 'connected':
    case 'completed':
      return '*'
    case 'trial':
    case 'draft':
    case 'running':
    case 'pending':
      return '~'
    case 'churned':
    case 'disabled':
    case 'failed':
    case 'error':
      return '!'
    default:
      return '-'
  }
}

export default function StatusBadge({ status, label }: StatusBadgeProps) {
  const color = getStatusColor(status)
  const symbol = getStatusSymbol(status)
  const display = label || status

  return (
    <Text color={color}>[{symbol}] {display}</Text>
  )
}
