import { useState } from 'react'
import { QUALITY, QUALITY_ORDER, type CameraMode, type PredatorChoice, type QualityLevel } from '../sim/config'
import { OVERLAY_COLORS } from '../render/Overlays'
import { screenshotRef } from '../render/Scene'
import { useSimStore } from '../store/useSimStore'
import { Button, Panel, Section, Segmented, Select, Slider, Toggle } from './controls'

type Tab = 'school' | 'environment' | 'predators' | 'camera' | 'view' | 'sim'

const TABS: { id: Tab; label: string }[] = [
  { id: 'school', label: 'Schooling' },
  { id: 'environment', label: 'Environment' },
  { id: 'predators', label: 'Predators' },
  { id: 'camera', label: 'Camera' },
  { id: 'view', label: 'Visualize' },
  { id: 'sim', label: 'Simulation' },
]

const CAMERA_MODES: { value: CameraMode; label: string; hint: string }[] = [
  { value: 'cinematic', label: 'Documentary', hint: 'An automatic director frames interesting activity with slow, restrained moves.' },
  { value: 'free', label: 'Free orbit', hint: 'Drag to orbit, right-drag / two fingers to pan, scroll / pinch to zoom.' },
  { value: 'drone', label: 'Drone', hint: 'W A S D to move, Q / E down / up, Shift to go faster, drag to look around.' },
  { value: 'school', label: 'Follow school', hint: 'Tracks the largest detected school with a slow orbit.' },
  { value: 'individual', label: 'Follow fish', hint: 'Rides alongside the selected sardine (click a fish to select one).' },
  { value: 'predator', label: 'Predator', hint: 'Chases behind a predator. Use “Next predator” to switch.' },
]

function SchoolTab() {
  const s = useSimStore((st) => st.params.school)
  const set = useSimStore((st) => st.setSchool)
  return (
    <>
      <Section title="Population">
        <Slider label="Sardines" value={s.population} min={50} max={12000} step={50} digits={0} onChange={(v) => set({ population: v })} hint="Fish added join existing schools; removed fish are taken at random." />
        <Slider label="Individual variation" value={s.individualVariation} min={0} max={1} onChange={(v) => set({ individualVariation: v })} hint="Differences in size, preferred speed, swimming rhythm and boldness (applies to newly added fish) and in wandering." />
      </Section>
      <Section title="Swimming">
        <Slider label="Cruising speed" value={s.cruiseSpeed} min={0.2} max={1.5} unit="m/s" onChange={(v) => set({ cruiseSpeed: v })} />
        <Slider label="Max burst speed" value={s.burstSpeed} min={0.8} max={4} unit="m/s" onChange={(v) => set({ burstSpeed: v })} />
        <Slider label="Turning responsiveness" value={s.turnResponsiveness} min={0.3} max={2.5} onChange={(v) => set({ turnResponsiveness: v })} />
      </Section>
      <Section title="Social rules" note="Weights are model parameters, not measured constants.">
        <Slider label="Separation" value={s.separation} min={0} max={4} onChange={(v) => set({ separation: v })} />
        <Slider label="Alignment" value={s.alignment} min={0} max={3} onChange={(v) => set({ alignment: v })} />
        <Slider label="Cohesion" value={s.cohesion} min={0} max={3} onChange={(v) => set({ cohesion: v })} />
        <Slider label="Preferred spacing" value={s.preferredSpacing} min={0.4} max={2.5} unit="BL" onChange={(v) => set({ preferredSpacing: v })} hint="Nearest-neighbour distance in body lengths." />
        <Slider label="Density response" value={s.densityResponse} min={0} max={1} onChange={(v) => set({ densityResponse: v })} hint="How much perceived danger tightens spacing and strengthens grouping." />
      </Section>
      <Section title="Perception">
        <Slider label="Sensory range" value={s.sensoryRange} min={0.8} max={10} unit="m" onChange={(v) => set({ sensoryRange: v })} hint="Maximum visual range for schoolmates; turbid water reduces it further." />
        <Slider label="Neighbour limit" value={s.neighborLimit} min={2} max={24} step={1} digits={0} onChange={(v) => set({ neighborLimit: v })} hint="Each fish attends to at most this many nearest visible schoolmates (topological interaction)." />
      </Section>
    </>
  )
}

function EnvironmentTab() {
  const e = useSimStore((st) => st.params.env)
  const obstacles = useSimStore((st) => st.params.obstacles)
  const set = useSimStore((st) => st.setEnv)
  const setObstacles = useSimStore((st) => st.setObstacles)
  return (
    <>
      <Section title="Water">
        <Slider label="Visibility" value={e.visibility} min={8} max={90} unit="m" digits={0} onChange={(v) => set({ visibility: v })} hint="Limits both what you see and what fish and predators can see." />
        <Slider label="Sunlight" value={e.sunlight} min={0.1} max={1.8} onChange={(v) => set({ sunlight: v })} />
        <Slider label="Surface waves" value={e.waveIntensity} min={0} max={2.5} onChange={(v) => set({ waveIntensity: v })} />
        <Slider label="Ocean depth" value={e.oceanDepth} min={20} max={300} unit="m" digits={0} onChange={(v) => set({ oceanDepth: v })} />
        <Slider label="Preferred depth" value={e.preferredDepth} min={3} max={Math.max(4, Math.min(60, e.oceanDepth - 6))} unit="m" digits={0} onChange={(v) => set({ preferredDepth: v })} />
      </Section>
      <Section title="Currents">
        <Slider label="Current strength" value={e.currentStrength} min={0} max={1.2} unit="m/s" onChange={(v) => set({ currentStrength: v })} />
        <Slider label="Current direction" value={e.currentDirection} min={0} max={359} step={1} unit="°" digits={0} onChange={(v) => set({ currentDirection: v })} />
        <Slider label="Eddies & variability" value={e.currentVariability} min={0} max={1} onChange={(v) => set({ currentVariability: v })} />
      </Section>
      <Section title="Food & structure">
        <Slider label="Plankton concentration" value={e.plankton} min={0} max={1} onChange={(v) => set({ plankton: v })} hint="Number and richness of drifting plankton patches." />
        <Toggle label="Rock pinnacles (obstacles)" checked={obstacles} onChange={setObstacles} />
      </Section>
    </>
  )
}

function PredatorTab() {
  const p = useSimStore((st) => st.params.predators)
  const set = useSimStore((st) => st.setPredators)
  return (
    <>
      <Section title="Predators">
        <Select<PredatorChoice>
          label="Species"
          value={p.species}
          onChange={(v) => set({ species: v })}
          options={[
            { value: 'dolphin', label: 'Dolphins (herding pod)' },
            { value: 'shark', label: 'Sharks (charging)' },
            { value: 'sailfish', label: 'Sailfish (slashing)' },
            { value: 'seabird', label: 'Gannets (plunge-diving)' },
            { value: 'mixed', label: 'Mixed (Sardine Run)' },
          ]}
        />
        <Slider label="Count" value={p.count} min={0} max={12} step={1} digits={0} onChange={(v) => set({ count: v })} />
        <Slider label="Hunting intensity" value={p.huntingIntensity} min={0} max={1} onChange={(v) => set({ huntingIntensity: v })} hint="0 = predators only patrol; 1 = frequent, persistent attacks." />
        <Slider label="Detection range" value={p.detectionRange} min={5} max={80} unit="m" digits={0} onChange={(v) => set({ detectionRange: v })} />
        <Slider label="Predator speed" value={p.speedMultiplier} min={0.4} max={1.8} unit="×" onChange={(v) => set({ speedMultiplier: v })} />
      </Section>
      <Section title="Captures">
        <Toggle label="Captures remove fish" checked={p.captureEnabled} onChange={(v) => set({ captureEnabled: v })} hint="Off = non-lethal demonstration: strikes happen but the population is preserved." />
        <p className="text-[11px] leading-snug text-slate-400">
          {p.captureEnabled
            ? 'A capture needs the predator’s mouth physically at a fish during a strike.'
            : 'Non-lethal demonstration mode: strikes startle fish but the population is preserved.'}
        </p>
      </Section>
    </>
  )
}

function CameraTab() {
  const camera = useSimStore((st) => st.camera)
  const setCamera = useSimStore((st) => st.setCamera)
  const cyclePredator = useSimStore((st) => st.cyclePredator)
  const nPred = useSimStore((st) => st.stats.predators)
  const hint = CAMERA_MODES.find((m) => m.value === camera)?.hint
  return (
    <>
      <Section title="Camera mode">
        <Segmented label="Camera mode" value={camera} onChange={setCamera} options={CAMERA_MODES.map((m) => ({ value: m.value, label: m.label, title: m.hint }))} />
        <p className="mt-2 text-[11px] leading-snug text-slate-400">{hint}</p>
        {camera === 'predator' && (
          <div className="mt-2">
            <Button onClick={cyclePredator}>{nPred > 0 ? 'Next predator' : 'No predators present'}</Button>
          </div>
        )}
      </Section>
    </>
  )
}

function ViewTab() {
  const o = useSimStore((st) => st.overlays)
  const set = useSimStore((st) => st.setOverlay)
  const quality = useSimStore((st) => st.quality)
  const auto = useSimStore((st) => st.autoQuality)
  const setQuality = useSimStore((st) => st.setQuality)
  const setAuto = useSimStore((st) => st.setAutoQuality)
  return (
    <>
      <Section title="Behavioural overlays" note="Vectors are the weighted steering terms from the last simulation step (a sample of up to 700 fish).">
        <Toggle label="Velocity" swatch={OVERLAY_COLORS.velocity} checked={o.velocity} onChange={(v) => set({ velocity: v })} />
        <Toggle label="Separation" swatch={OVERLAY_COLORS.separation} checked={o.separation} onChange={(v) => set({ separation: v })} />
        <Toggle label="Alignment" swatch={OVERLAY_COLORS.alignment} checked={o.alignment} onChange={(v) => set({ alignment: v })} />
        <Toggle label="Cohesion" swatch={OVERLAY_COLORS.cohesion} checked={o.cohesion} onChange={(v) => set({ cohesion: v })} />
        <Toggle label="Predator avoidance" swatch={OVERLAY_COLORS.avoidance} checked={o.avoidance} onChange={(v) => set({ avoidance: v })} />
        <Toggle label="Sensory neighbourhood (selected fish)" checked={o.neighborhoods} onChange={(v) => set({ neighborhoods: v })} />
        <Toggle label="Ocean-current vectors" checked={o.currents} onChange={(v) => set({ currents: v })} />
        <Toggle label="Detected schools" checked={o.schools} onChange={(v) => set({ schools: v })} />
      </Section>
      <Section title="Rendering quality">
        <Select<QualityLevel>
          label="Preset"
          value={quality}
          onChange={(v) => setQuality(v, true)}
          options={QUALITY_ORDER.map((q) => ({ value: q, label: `${QUALITY[q].label} (~${QUALITY[q].suggestedPopulation.toLocaleString()} fish)` }))}
        />
        <Toggle label="Adapt automatically" checked={auto} onChange={setAuto} hint="Lower effects, then population, if the frame rate stays low." />
      </Section>
    </>
  )
}

function SimTab() {
  const st = useSimStore()
  return (
    <>
      <Section title="Time">
        <div className="flex flex-wrap gap-1.5 pb-1">
          <Button onClick={() => st.setPaused(!st.paused)} active={st.paused}>
            {st.paused ? '▶ Resume' : '❚❚ Pause'}
          </Button>
          {st.paused && <Button onClick={st.stepOnce}>Step</Button>}
          <Button onClick={st.toggleSlowMotion} active={st.slowMotion}>
            Slow motion
          </Button>
        </div>
        <Slider label="Simulation speed" value={st.timeScale} min={0.1} max={3} unit="×" onChange={st.setTimeScale} />
      </Section>
      <Section title="Run">
        <div className="flex flex-wrap gap-1.5">
          <Button onClick={st.reset} title="Restart this scenario with the current parameters">
            Reset
          </Button>
          <Button onClick={st.randomize} title="Restart with randomized initial positions and headings">
            Randomize
          </Button>
          <Button onClick={st.restoreDefaults} title="Return all parameters to this scenario’s defaults">
            Restore defaults
          </Button>
          <Button onClick={() => screenshotRef.current?.()}>Screenshot</Button>
        </div>
      </Section>
      <Section title="Performance">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-300">
          <dt className="text-slate-400">Render</dt>
          <dd className="text-right font-mono">
            {st.perf.fps.toFixed(0)} fps · {st.perf.renderMs.toFixed(1)} ms
          </dd>
          <dt className="text-slate-400">Simulation step</dt>
          <dd className="text-right font-mono">{st.perf.simStepMs.toFixed(1)} ms</dd>
          <dt className="text-slate-400">Sim thread load</dt>
          <dd className="text-right font-mono">{(st.perf.simLoad * 100).toFixed(0)}%</dd>
          <dt className="text-slate-400">Step rate</dt>
          <dd className="text-right font-mono">{st.paused ? '—' : `${(st.perf.simRate * (st.slowMotion ? 1 : 1)).toFixed(0)} Hz`}</dd>
        </dl>
        <p className="mt-1 text-[11px] leading-snug text-slate-400">The simulation runs in a background worker at a fixed 30 Hz step; rendering interpolates between steps.</p>
      </Section>
    </>
  )
}

export function ControlPanel() {
  const open = useSimStore((s) => s.panel.controls)
  const toggle = useSimStore((s) => s.togglePanel)
  const [tab, setTab] = useState<Tab>('school')
  return (
    <div className="pointer-events-auto flex max-h-full flex-col items-end gap-2">
      <Button onClick={() => toggle('controls')} active={open} aria-label="Toggle controls panel">
        <span aria-hidden>☰</span> Controls
      </Button>
      {open && (
        <Panel className="flex max-h-[calc(100vh-170px)] w-[300px] max-w-[calc(100vw-24px)] flex-col overflow-hidden">
          <div role="tablist" aria-label="Control groups" className="flex flex-wrap gap-1 border-b border-white/10 p-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-md px-2 py-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 ${
                  tab === t.id ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div role="tabpanel" className="scroll-thin space-y-2 overflow-y-auto px-3 py-2">
            {tab === 'school' && <SchoolTab />}
            {tab === 'environment' && <EnvironmentTab />}
            {tab === 'predators' && <PredatorTab />}
            {tab === 'camera' && <CameraTab />}
            {tab === 'view' && <ViewTab />}
            {tab === 'sim' && <SimTab />}
          </div>
        </Panel>
      )}
    </div>
  )
}
