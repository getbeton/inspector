'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getIntegrationCredentials,
  saveIntegration,
  disconnectIntegration,
} from '@/lib/api/integrations'

export const integrationKeys = {
  all: ['integrations'] as const,
  credentials: (name: string) => [...integrationKeys.all, 'credentials', name] as const,
}

/**
 * Fetches decrypted credentials for a specific integration.
 */
export function useIntegrationCredentials(name: string) {
  return useQuery({
    queryKey: integrationKeys.credentials(name),
    queryFn: () => getIntegrationCredentials(name),
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Saves integration configuration. Invalidates credentials query on success.
 */
export function useSaveIntegration() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ name, config }: { name: string; config: Record<string, string> }) =>
      saveIntegration(name, config),
    onSuccess: (_data, { name }) => {
      queryClient.invalidateQueries({ queryKey: integrationKeys.credentials(name) })
    },
  })
}

/**
 * Disconnects an integration. Invalidates credentials query on success.
 */
export function useDisconnectIntegration() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (name: string) => disconnectIntegration(name),
    onSuccess: (_data, name) => {
      queryClient.invalidateQueries({ queryKey: integrationKeys.credentials(name) })
    },
  })
}
