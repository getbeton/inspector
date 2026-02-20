'use client'

import { useQuery } from '@tanstack/react-query'

export interface SetupStatus {
  setupComplete: boolean
  integrations: {
    posthog: boolean
    attio: boolean
  }
  billing: {
    required: boolean
    configured: boolean
    status: string | null
  }
  workspaceId: string
}

async function fetchSetupStatus(): Promise<SetupStatus> {
  const res = await fetch('/api/workspace/setup-status')
  if (res.status === 401) {
    // Guest user — return default "not set up" so pages fall into demo mode
    return {
      setupComplete: false,
      integrations: { posthog: false, attio: false },
      billing: { required: false, configured: false, status: null },
      workspaceId: '',
    }
  }
  if (!res.ok) throw new Error('Failed to fetch setup status')
  return res.json()
}

export const setupStatusKeys = {
  all: ['workspace', 'setup-status'] as const,
}

export function useSetupStatus() {
  return useQuery({
    queryKey: setupStatusKeys.all,
    queryFn: fetchSetupStatus,
    staleTime: 30_000,
  })
}
