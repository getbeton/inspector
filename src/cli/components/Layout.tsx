import React from 'react'
import { Box, Text } from 'ink'

interface LayoutProps {
  title?: string
  workspace?: string
  children: React.ReactNode
  footer?: string
  showNav?: boolean
}

const VERSION = '0.1.0'

export default function Layout({
  title,
  workspace,
  children,
  footer,
  showNav = true,
}: LayoutProps) {
  return (
    <Box flexDirection="column" width="100%">
      {/* Header */}
      <Box justifyContent="space-between">
        <Text bold color="cyan">
          Inspector v{VERSION}
          {title ? ` - ${title}` : ''}
        </Text>
        {workspace && (
          <Text dimColor>workspace: {workspace}</Text>
        )}
      </Box>
      <Text dimColor>{'\u2500'.repeat(70)}</Text>

      {/* Main content */}
      <Box flexDirection="column" marginY={1}>
        {children}
      </Box>

      {/* Footer */}
      <Text dimColor>{'\u2500'.repeat(70)}</Text>
      {showNav && (
        <Text dimColor>
          {footer ||
            '[s]ignals  [a]ccounts  [i]ntegrations  mc[p]  [k]eys  [d]ashboard  [q]uit  [?]help'}
        </Text>
      )}
    </Box>
  )
}
