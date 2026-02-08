'use client'

import { useQuery } from '@tanstack/react-query'
import { useSetupStatus } from './use-setup-status'

export interface EventDefinition {
  name: string
  volume_30_day: number
}

interface EventDefinitionsResponse {
  results: EventDefinition[]
}

async function fetchEventDefinitions(includeSystem = false): Promise<EventDefinition[]> {
  const params = includeSystem ? '?include_system=true' : ''
  const res = await fetch(`/api/posthog/events/definitions${params}`)
  if (!res.ok) {
    throw new Error('Failed to fetch event definitions')
  }
  const data: EventDefinitionsResponse = await res.json()
  return data.results
}

/**
 * Hook to fetch PostHog event definitions for the EventPicker.
 * Only enabled when PostHog integration is connected.
 */
export function useEventDefinitions(options?: { includeSystem?: boolean }) {
  const { data: setupStatus } = useSetupStatus()
  const posthogConnected = setupStatus?.integrations?.posthog ?? false

  return useQuery({
    queryKey: ['posthog', 'event-definitions', options?.includeSystem ?? false],
    queryFn: () => fetchEventDefinitions(options?.includeSystem),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: posthogConnected,
  })
}
