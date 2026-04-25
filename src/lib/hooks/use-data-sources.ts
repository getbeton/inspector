/**
 * React Query hooks for data sources.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listDataSources,
  getDataSource,
  createDataSource,
  updateDataSource,
  deleteDataSource,
  validateDataSource,
} from '@/lib/api/data-sources'
import type {
  CreateDataSourceRequest,
  UpdateDataSourceRequest,
} from '@/lib/integrations/postgres/types'

const KEYS = {
  all: ['data-sources'] as const,
  list: ['data-sources', 'list'] as const,
  detail: (id: string) => ['data-sources', 'detail', id] as const,
}

export function useDataSources() {
  return useQuery({
    queryKey: KEYS.list,
    queryFn: listDataSources,
  })
}

export function useDataSource(id: string) {
  return useQuery({
    queryKey: KEYS.detail(id),
    queryFn: () => getDataSource(id),
    enabled: !!id,
  })
}

export function useCreateDataSource() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (config: CreateDataSourceRequest) => createDataSource(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.list })
    },
  })
}

export function useUpdateDataSource() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateDataSourceRequest }) =>
      updateDataSource(id, patch),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: KEYS.list })
      queryClient.invalidateQueries({ queryKey: KEYS.detail(id) })
    },
  })
}

export function useDeleteDataSource() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteDataSource(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.list })
    },
  })
}

export function useValidateDataSource() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => validateDataSource(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.list })
    },
  })
}
