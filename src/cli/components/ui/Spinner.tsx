import React from 'react'
import { Text } from 'ink'
import InkSpinner from 'ink-spinner'

interface SpinnerProps {
  label?: string
}

export default function Spinner({ label = 'Loading...' }: SpinnerProps) {
  return (
    <Text>
      <Text color="cyan">
        <InkSpinner type="dots" />
      </Text>
      {' '}
      {label}
    </Text>
  )
}
