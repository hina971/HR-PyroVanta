import { create } from 'zustand'
import type { FirePoint } from './data/sample'

// Zustand UI state (framework §6): selected day, layers, view.
// Server data lives in TanStack Query (see App.tsx); this store holds
// only UI selection, so one selection updates every view.

export type View = 'dashboard' | 'map' | 'lab'

// Dataset year — 2023 (the original season) or 2026 (the second dataset,
// added 2026-11-15 from FIRMS archive + NRT). Every data loader reads
// the year to pick /data (2023) or /data/2026. Switching year resets the
// selected day/month/point, because dates are year-specific.
export type DatasetYear = 2023 | 2026

export interface Layers {
  modis: boolean
  viirs: boolean
  matched: boolean
  amb: boolean
}

interface FireState {
  year: DatasetYear
  selectedDate: string | null // YYYY-MM-DD, null = full season
  currentMonth: number // 7 | 8 | 9 (both years)
  layers: Layers
  view: View
  selectedPointId: number | null
  // A point clicked on the RealMap (Leaflet). The RealMap's GeoJSON
  // features are NOT in the hero map's 700-dot sample, so the Inspector
  // cannot look them up by id — instead the RealMap hands the Inspector
  // the full point object directly. The Inspector prefers this over the
  // id lookup. Hero-map clicks clear it (selectPoint does that).
  inspectorPoint: FirePoint | null
  tourOpen: boolean
  setYear: (y: DatasetYear) => void
  selectDay: (date: string) => void
  resetDemo: () => void
  setMonth: (m: number) => void
  toggleLayer: (key: keyof Layers) => void
  setView: (v: View) => void
  selectPoint: (id: number | null) => void
  setInspectorPoint: (p: FirePoint | null) => void
  setTourOpen: (open: boolean) => void
}

export const useFireStore = create<FireState>()((set) => ({
  year: 2023,
  selectedDate: null,
  currentMonth: 8,
  layers: { modis: true, viirs: true, matched: true, amb: true },
  view: 'dashboard',
  selectedPointId: null,
  inspectorPoint: null,
  tourOpen: false,
  setYear: (y) => set({ year: y, selectedDate: null, selectedPointId: null, inspectorPoint: null, currentMonth: 8 }),
  selectDay: (date) => set({ selectedDate: date }),
  resetDemo: () => set({ selectedDate: null, selectedPointId: null, inspectorPoint: null }),
  setMonth: (m) => set({ currentMonth: m }),
  toggleLayer: (key) =>
    set((s) => ({ layers: { ...s.layers, [key]: !s.layers[key] } })),
  setView: (v) => set({ view: v }),
  selectPoint: (id) => set({ selectedPointId: id, inspectorPoint: null }),
  setInspectorPoint: (p) => set({ inspectorPoint: p, selectedPointId: null }),
  setTourOpen: (open) => set({ tourOpen: open }),
}))
