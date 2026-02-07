'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Data Mode Store
 * Manages whether the app uses mock data or real API data
 * Persisted to localStorage
 */

interface DataModeStore {
  useMockData: boolean
  toggleDataMode: () => void
  setDataMode: (useMock: boolean) => void
}

export const useDataMode = create<DataModeStore>()(
  persist(
    (set) => ({
      useMockData: true, // Default to mock mode

      toggleDataMode: () =>
        set((state) => ({
          useMockData: !state.useMockData
        })),

      setDataMode: (useMock: boolean) =>
        set(() => ({
          useMockData: useMock
        }))
    }),
    {
      name: 'beton-data-mode' // localStorage key
    }
  )
)
