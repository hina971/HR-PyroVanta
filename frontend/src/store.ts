import { create } from 'zustand'

// Zustand UI state (framework §6): selected day, layers, view.
// Server data lives in TanStack Query (see App.tsx); this store holds
// only UI selection, so one selection updates every view.

export type View = 'dashboard' | 'map' | 'lab'

export interface Layers {
  modis: boolean
  viirs: boolean
  matched: boolean
  amb: boolean
}

interface FireState {
  selectedDate: string | null // YYYY-MM-DD, null = full season
  currentMonth: number // 7 | 8 | 9 (2023)
  layers: Layers
  view: View
  selectedPointId: number | null
  tourOpen: boolean
  selectDay: (date: string) => void
  resetDemo: () => void
  setMonth: (m: number) => void
  toggleLayer: (key: keyof Layers) => void
  setView: (v: View) => void
  selectPoint: (id: number | null) => void
  setTourOpen: (open: boolean) => void
}

export const useFireStore = create<FireState>()((set) => ({
  selectedDate: null,
  currentMonth: 8,
  layers: { modis: true, viirs: true, matched: true, amb: true },
  view: 'dashboard',
  selectedPointId: null,
  tourOpen: false,
  selectDay: (date) => set({ selectedDate: date }),
  resetDemo: () => set({ selectedDate: null, selectedPointId: null }),
  setMonth: (m) => set({ currentMonth: m }),
  toggleLayer: (key) =>
    set((s) => ({ layers: { ...s.layers, [key]: !s.layers[key] } })),
  setView: (v) => set({ view: v }),
  selectPoint: (id) => set({ selectedPointId: id }),
  setTourOpen: (open) => set({ tourOpen: open }),
}))
