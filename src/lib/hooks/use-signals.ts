'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getSignals, getSignal, getSignalsFromAPI, getRealSignalById,
  createSignal, updateSignal, deleteSignal, enableSignal, disableSignal, bulkUpdateSignals,
  getSignalAnalytics, getPropertyMappings, savePropertyMappings,
  getDealMappings, saveDealMappings,
} from '@/lib/api/signals'
import { useDataMode } from '@/lib/store/data-mode'
import type {
  Signal, SignalFilterParams, RealSignalDetailResponse,
  SignalAnalyticsResponse, SignalAnalyticsParams,
  PostHogPropertyMapping, AttioDealMapping,
} from '@/lib/api/signals'

/**
 * Hook to fetch all signals (legacy mock-aware)
 */
export function useSignals() {
  const { useMockData } = useDataMode()

  return useQuery({
    queryKey: ['signals', useMockData],
    queryFn: () => getSignals(useMockData),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true
  })
}

/**
 * Hook to fetch real signals from the database with filtering.
 * Does NOT depend on useDataMode — always fetches real data.
 */
export function useRealSignals(params?: SignalFilterParams) {
  return useQuery({
    queryKey: ['signals', 'real', params ?? {}],
    queryFn: () => getSignalsFromAPI(params),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  })
}

/**
 * Hook to fetch a single signal (legacy mock-aware)
 */
export function useSignal(id: string) {
  const { useMockData } = useDataMode()

  return useQuery({
    queryKey: ['signals', id, useMockData],
    queryFn: () => getSignal(id, useMockData),
    staleTime: 5 * 60 * 1000,
    enabled: !!id
  })
}

/**
 * Hook to fetch a single signal from the real database with metrics.
 * Does NOT depend on useDataMode — always fetches real data.
 */
export function useRealSignal(id: string) {
  return useQuery<RealSignalDetailResponse>({
    queryKey: ['signals', 'real', id],
    queryFn: () => getRealSignalById(id),
    staleTime: 5 * 60 * 1000,
    enabled: !!id,
  })
}

/**
 * Hook to create a signal
 */
export function useCreateSignal() {
  const { useMockData } = useDataMode()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: { name: string; conditions: any[] }) =>
      createSignal(data, useMockData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['signals'] })
    }
  })
}

/**
 * Hook to update a signal
 */
export function useUpdateSignal(id: string) {
  const { useMockData } = useDataMode()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: Partial<Signal>) =>
      updateSignal(id, data, useMockData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['signals'] })
      queryClient.invalidateQueries({ queryKey: ['signals', id] })
    }
  })
}

/**
 * Hook to delete a signal
 */
export function useDeleteSignal() {
  const { useMockData } = useDataMode()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteSignal(id, useMockData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['signals'] })
    }
  })
}

/**
 * Hook to enable a signal
 */
export function useEnableSignal() {
  const { useMockData } = useDataMode()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => enableSignal(id, useMockData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['signals'] })
    }
  })
}

/**
 * Hook to disable a signal
 */
export function useDisableSignal() {
  const { useMockData } = useDataMode()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => disableSignal(id, useMockData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['signals'] })
    }
  })
}

/**
 * Hook to bulk update signals
 */
export function useBulkUpdateSignals() {
  const { useMockData } = useDataMode()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: { ids: string[]; action: 'enable' | 'disable' | 'delete' }) =>
      bulkUpdateSignals(data.ids, data.action, useMockData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['signals'] })
    }
  })
}

// ── Signal Analytics Hooks ──────────────────────────────────

/**
 * Hook to fetch signal analytics (time-series, KPIs, retention, curves).
 * Keyed by signal ID + analytics params so window/filter changes refetch.
 */
export function useSignalAnalytics(signalId: string, params?: SignalAnalyticsParams) {
  return useQuery<SignalAnalyticsResponse>({
    queryKey: ['signals', 'analytics', signalId, params ?? {}],
    queryFn: () => getSignalAnalytics(signalId, params),
    staleTime: 5 * 60 * 1000,
    enabled: !!signalId,
  })
}

/**
 * Hook to fetch PostHog property mappings for the workspace.
 */
export function usePropertyMappings(mappingType?: 'plan' | 'segment' | 'revenue') {
  return useQuery({
    queryKey: ['property-mappings', mappingType ?? 'all'],
    queryFn: () => getPropertyMappings(mappingType),
    staleTime: 10 * 60 * 1000,
  })
}

/**
 * Hook to save PostHog property mappings.
 */
export function useSavePropertyMappings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (mappings: Omit<PostHogPropertyMapping, 'id'>[]) =>
      savePropertyMappings(mappings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-mappings'] })
    },
  })
}

/**
 * Hook to fetch Attio deal mappings.
 */
export function useDealMappings() {
  return useQuery({
    queryKey: ['deal-mappings'],
    queryFn: () => getDealMappings(),
    staleTime: 10 * 60 * 1000,
  })
}

/**
 * Hook to save Attio deal mappings.
 */
export function useSaveDealMappings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (mappings: Omit<AttioDealMapping, 'id'>[]) =>
      saveDealMappings(mappings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal-mappings'] })
    },
  })
}
