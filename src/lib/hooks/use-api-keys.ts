'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listApiKeys,
  createApiKey,
  revealApiKey,
  deleteApiKey,
  type ApiKeyMeta,
  type ApiKeyCreateResponse,
} from '@/lib/api/api-keys'

// ---------------------------------------------------------------------------
// Query Keys
// ---------------------------------------------------------------------------

export const apiKeyKeys = {
  all: ['apiKeys'] as const,
  list: () => [...apiKeyKeys.all, 'list'] as const,
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** List all API keys (metadata only). */
export function useApiKeys() {
  return useQuery<ApiKeyMeta[]>({
    queryKey: apiKeyKeys.list(),
    queryFn: listApiKeys,
    staleTime: 5 * 60 * 1000,
  })
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Generate a new API key. Invalidates the list cache on success. */
export function useCreateApiKey() {
  const qc = useQueryClient()
  return useMutation<ApiKeyCreateResponse, Error, string | undefined>({
    mutationFn: (name) => createApiKey(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: apiKeyKeys.list() })
    },
  })
}

/** Reveal (decrypt) a stored API key. */
export function useRevealApiKey() {
  return useMutation<string, Error, string>({
    mutationFn: (id) => revealApiKey(id),
  })
}

/** Revoke an API key. Invalidates the list cache on success. */
export function useDeleteApiKey() {
  const qc = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: (id) => deleteApiKey(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: apiKeyKeys.list() })
    },
  })
}
