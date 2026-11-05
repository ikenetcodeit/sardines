import { create } from 'zustand'
import {
  DEFAULT_OVERLAYS,
  QUALITY,
  QUALITY_ORDER,
  type CameraMode,
  type EnvironmentParams,
  type OverlayParams,
  type PredatorParams,
  type QualityLevel,
  type SchoolParams,
  type SimParams,
} from '../sim/config'
import { simClient } from '../sim/client'
import type { FishDetail, Frame } from '../sim/protocol'
import type { PredatorEvent } from '../sim/PredatorSystem'
import { getScenario, scenarioParams, type ScenarioId } from '../sim/scenarios'
import { EMPTY_STATS, type SimStats } from '../sim/SchoolAnalysis'

export interface PerfInfo {
  fps: number
  renderMs: number
  simStepMs: number
  simLoad: number
  simRate: number
}

export interface Toast {
  id: number
  text: string
  tone: 'info' | 'warn' | 'capture'
}

function gpuName(): string {
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    if (!gl) return 'none'
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return name
  } catch {
    return 'unknown'
  }
}

/** Pick a starting quality preset from device class and GPU (auto-adapt refines it later). */
function detectQuality(): QualityLevel {
  if (typeof window === 'undefined') return 'medium'
  const mobile = window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 760
  const cores = navigator.hardwareConcurrency ?? 4
  const gpu = gpuName().toLowerCase()
  if (mobile || /swiftshader|llvmpipe|software|none/.test(gpu)) return 'low'
  // older integrated graphics
  if (/intel.*(hd|uhd) graphics|mali|adreno|powervr/.test(gpu)) return 'medium'
  if (cores >= 8 && /nvidia|geforce|radeon|rtx|apple m\d|arc/.test(gpu)) return 'high'
  return 'medium'
}

/** Scenario populations are capped by what the current quality preset can sustain. */
function fitPopulation(p: SimParams, q: QualityLevel) {
  const cap = Math.round(QUALITY[q].suggestedPopulation * 1.6)
  p.school.population = Math.min(p.school.population, Math.max(250, cap))
  return p
}

interface SimState {
  scenario: ScenarioId
  seed: number
  params: SimParams
  overlays: OverlayParams
  paused: boolean
  timeScale: number
  slowMotion: boolean
  quality: QualityLevel
  autoQuality: boolean
  camera: CameraMode
  followPredator: number
  selectedId: number
  selected: FishDetail | null
  stats: SimStats
  perf: PerfInfo
  toasts: Toast[]
  events: PredatorEvent[]
  ready: boolean
  /** Changes whenever the simulation was (re)initialised. */
  frameVersion: number
  panel: { controls: boolean; info: boolean; stats: boolean }

  loadScenario: (id: ScenarioId) => void
  reset: () => void
  randomize: () => void
  restoreDefaults: () => void
  setSchool: (p: Partial<SchoolParams>) => void
  setEnv: (p: Partial<EnvironmentParams>) => void
  setPredators: (p: Partial<PredatorParams>) => void
  setObstacles: (on: boolean) => void
  setOverlay: (p: Partial<OverlayParams>) => void
  setPaused: (p: boolean) => void
  stepOnce: () => void
  setTimeScale: (s: number) => void
  toggleSlowMotion: () => void
  setQuality: (q: QualityLevel, manual?: boolean) => void
  setAutoQuality: (b: boolean) => void
  setCamera: (m: CameraMode) => void
  cyclePredator: () => void
  select: (id: number) => void
  togglePanel: (k: keyof SimState['panel']) => void
  toast: (text: string, tone?: Toast['tone']) => void
  dismissToast: (id: number) => void
  setPerf: (p: Partial<PerfInfo>) => void
}

let toastId = 1
const initialQuality = detectQuality()
const initialScenario: ScenarioId = 'open'

export const useSimStore = create<SimState>((set, get) => {
  const sendParams = (params: SimParams) => simClient.send({ type: 'params', params })
  const sendControl = () => {
    const s = get()
    simClient.send({ type: 'control', paused: s.paused, timeScale: s.slowMotion ? s.timeScale * 0.25 : s.timeScale })
  }
  const sendOverlays = (o: OverlayParams) =>
    simClient.send({
      type: 'overlays',
      forces: o.separation || o.alignment || o.cohesion || o.avoidance || o.velocity,
      labels: o.schools,
    })
  const load = (id: ScenarioId, seed: number, params?: SimParams) => {
    const sc = getScenario(id)
    const p = params ?? fitPopulation(scenarioParams(id), get().quality)
    const overlays = { ...get().overlays, currents: false, ...(sc.overlays ?? {}) }
    set({ scenario: id, seed, params: p, overlays, selectedId: -1, selected: null, camera: sc.camera, events: [] })
    simClient.send({ type: 'select', id: -1 })
    sendOverlays(overlays)
    simClient.load(id, seed, p)
  }
  return {
    scenario: initialScenario,
    seed: 1,
    params: fitPopulation(scenarioParams(initialScenario), initialQuality),
    overlays: { ...DEFAULT_OVERLAYS },
    paused: false,
    timeScale: 1,
    slowMotion: false,
    quality: initialQuality,
    autoQuality: true,
    camera: getScenario(initialScenario).camera,
    followPredator: 0,
    selectedId: -1,
    selected: null,
    stats: EMPTY_STATS,
    perf: { fps: 0, renderMs: 0, simStepMs: 0, simLoad: 0, simRate: 0 },
    toasts: [],
    events: [],
    ready: false,
    frameVersion: -1,
    panel: {
      controls: typeof window !== 'undefined' ? window.innerWidth > 1100 : true,
      info: typeof window !== 'undefined' ? window.innerWidth > 1100 && window.innerHeight > 860 : true,
      stats: typeof window !== 'undefined' ? window.innerWidth > 760 : true,
    },

    loadScenario: (id) => load(id, 1),
    reset: () => load(get().scenario, get().seed, structuredClone(get().params)),
    randomize: () => load(get().scenario, 2 + Math.floor(Math.random() * 1e6), structuredClone(get().params)),
    restoreDefaults: () => {
      const p = fitPopulation(scenarioParams(get().scenario), get().quality)
      set({ params: p, timeScale: 1, slowMotion: false })
      sendParams(p)
      sendControl()
      get().toast('Parameters restored to scenario defaults')
    },
    setSchool: (p) => {
      const params = { ...get().params, school: { ...get().params.school, ...p } }
      set({ params })
      sendParams(params)
    },
    setEnv: (p) => {
      const params = { ...get().params, env: { ...get().params.env, ...p } }
      set({ params })
      sendParams(params)
    },
    setPredators: (p) => {
      const params = { ...get().params, predators: { ...get().params.predators, ...p } }
      set({ params })
      sendParams(params)
    },
    setObstacles: (on) => {
      const params = { ...get().params, obstacles: on }
      set({ params })
      sendParams(params)
    },
    setOverlay: (p) => {
      const overlays = { ...get().overlays, ...p }
      set({ overlays })
      sendOverlays(overlays)
    },
    setPaused: (paused) => {
      set({ paused })
      sendControl()
    },
    stepOnce: () => simClient.send({ type: 'step' }),
    setTimeScale: (timeScale) => {
      set({ timeScale })
      sendControl()
    },
    toggleSlowMotion: () => {
      set({ slowMotion: !get().slowMotion })
      sendControl()
    },
    setQuality: (quality, manual = true) => {
      set(manual ? { quality, autoQuality: false } : { quality })
    },
    setAutoQuality: (autoQuality) => set({ autoQuality }),
    setCamera: (camera) => {
      set({ camera })
      if (camera === 'individual' && get().selectedId < 0) {
        // pick a fish near the middle of the largest school
        const f = simClient.cur
        const L = get().stats.largest
        if (f && f.count > 0) {
          let best = 0
          let bd = Infinity
          for (let i = 0; i < f.count; i += 3) {
            const d = L ? Math.hypot(f.pos[i * 3] - L.cx, f.pos[i * 3 + 1] - L.cy, f.pos[i * 3 + 2] - L.cz) : i
            if (d < bd) {
              bd = d
              best = i
            }
          }
          get().select(f.ids[best])
        }
      }
    },
    cyclePredator: () => {
      const n = simClient.cur?.predators.length ?? 0
      set({ followPredator: n > 0 ? (get().followPredator + 1) % n : 0 })
    },
    select: (id) => {
      set({ selectedId: id, selected: null })
      simClient.send({ type: 'select', id })
    },
    togglePanel: (k) => set({ panel: { ...get().panel, [k]: !get().panel[k] } }),
    toast: (text, tone = 'info') => {
      const id = toastId++
      set({ toasts: [...get().toasts.slice(-3), { id, text, tone }] })
      setTimeout(() => get().dismissToast(id), tone === 'capture' ? 4000 : 5500)
    },
    dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
    setPerf: (p) => set({ perf: { ...get().perf, ...p } }),
  }
})

export function qualityBelow(q: QualityLevel): QualityLevel | null {
  const i = QUALITY_ORDER.indexOf(q)
  return i > 0 ? QUALITY_ORDER[i - 1] : null
}

// ---- wire worker frames into (throttled) UI state ----
let lastUi = 0
simClient.frameListeners.add((f: Frame) => {
  const st = useSimStore.getState()
  if (f.events.length) {
    const events = [...st.events, ...f.events].slice(-30)
    useSimStore.setState({ events })
    for (const e of f.events) if (e.kind === 'capture') st.toast(e.text, 'capture')
  }
  if (f.version !== st.frameVersion) useSimStore.setState({ frameVersion: f.version })
  const now = performance.now()
  if (!st.ready || now - lastUi > 200 || f.paused) {
    lastUi = now
    useSimStore.setState({
      stats: f.stats,
      selected: f.selected,
      ready: true,
      perf: {
        ...st.perf,
        simStepMs: f.stepMs,
        simLoad: f.load,
        simRate: 1000 / simClient.frameInterval,
      },
    })
  }
})

// kick off the initial scenario
{
  const s = useSimStore.getState()
  simClient.load(s.scenario, s.seed, s.params)
}

if (import.meta.env.DEV) (window as unknown as { __store: typeof useSimStore }).__store = useSimStore
