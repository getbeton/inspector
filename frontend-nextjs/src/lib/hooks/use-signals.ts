'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSignals, getSignal, createSignal, updateSignal, deleteSignal, enableSignal, disableSignal, runBacktest, bulkUpdateSignals } from '@/lib/api/signals'
import { useDataMode } from '@/lib/store/data-mode'
import type { Signal, SignalDetail, BacktestRequest, BacktestResponse } from '@/lib/api/signals'

/**
 * Hook to fetch all signals
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
 * Hook to fetch a single signal
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
 * Hook to run backtest
 */
export function useBacktest() {
  const { useMockData } = useDataMode()

  return useMutation({
    mutationFn: (request: BacktestRequest) =>
      runBacktest(request, useMockData)
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
