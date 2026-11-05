import { useEffect, useState } from 'react'
import { screenshotRef } from '../render/Scene'
import { SCENARIOS, getScenario } from '../sim/scenarios'
import { useSimStore } from '../store/useSimStore'
import { Badge, Button, Panel, Stat } from './controls'

export function TopBar() {
  const scenario = useSimStore((s) => getScenario(s.scenario))
  const stats = useSimStore((s) => s.stats)
  const perf = useSimStore((s) => s.perf)
  const paused = useSimStore((s) => s.paused)
  const slow = useSimStore((s) => s.slowMotion)
  const timeScale = useSimStore((s) => s.timeScale)
  const status = paused ? 'Paused' : slow ? `Slow motion (${(timeScale * 0.25).toFixed(2)}×)` : timeScale !== 1 ? `${timeScale.toFixed(1)}×` : 'Live'
  return (
    <header className="pointer-events-none flex flex-wrap items-start justify-between gap-3">
      <div className="pointer-events-auto">
        <h1 className="font-display text-[26px] leading-none tracking-wide text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)] sm:text-[30px]">Sardine School</h1>
        <p className="mt-1 text-[11px] uppercase tracking-[0.28em] text-sky-100/70">A Living Ocean</p>
      </div>
      <Panel className="pointer-events-auto flex items-center gap-4 px-4 py-2">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Scenario {scenario.letter}</div>
          <div className="font-display text-[17px] leading-tight text-white">{scenario.name}</div>
        </div>
        <div className="hidden h-8 w-px bg-white/10 sm:block" />
        <div className="hidden sm:block" aria-live="polite">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Observed state</div>
          <div className="text-[13px] text-amber-100">{stats.formation}</div>
        </div>
        <div className="hidden h-8 w-px bg-white/10 md:block" />
        <div className="hidden gap-4 md:flex">
          <Stat label="Fish" value={stats.fishCount.toLocaleString()} />
          <Stat label="Schools" value={String(stats.schools)} />
          <Stat label="FPS" value={perf.fps.toFixed(0)} />
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${paused ? 'bg-amber-400/20 text-amber-100' : 'bg-emerald-400/15 text-emerald-100'}`}
        >
          {status}
        </span>
      </Panel>
    </header>
  )
}

export function ScenarioBar() {
  const current = useSimStore((s) => s.scenario)
  const load = useSimStore((s) => s.loadScenario)
  return (
    <nav aria-label="Scenarios" className="pointer-events-auto">
      <Panel className="scroll-thin flex max-w-[calc(100vw-24px)] gap-1 overflow-x-auto p-1.5">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            onClick={() => load(s.id)}
            aria-current={current === s.id}
            title={s.tagline}
            className={`group flex shrink-0 items-center gap-2 rounded-xl px-3 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 ${
              current === s.id ? 'bg-white/15' : 'hover:bg-white/8'
            }`}
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold ${
                current === s.id ? 'border-amber-200/60 bg-amber-200/20 text-amber-50' : 'border-white/15 text-slate-300'
              }`}
            >
              {s.letter}
            </span>
            <span className={`text-[12px] ${current === s.id ? 'text-white' : 'text-slate-300'}`}>{s.name}</span>
          </button>
        ))}
      </Panel>
    </nav>
  )
}

function Bar({ value, color = 'bg-sky-300' }: { value: number; color?: string }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
      <div className={`h-full ${color}`} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  )
}

export function StatsPanel() {
  const open = useSimStore((s) => s.panel.stats)
  const toggle = useSimStore((s) => s.togglePanel)
  const s = useSimStore((st) => st.stats)
  const perf = useSimStore((st) => st.perf)
  return (
    <div className="pointer-events-auto flex flex-col items-start gap-2">
      <Button onClick={() => toggle('stats')} active={open} aria-label="Toggle school statistics">
        <span aria-hidden>▤</span> Statistics
      </Button>
      {open && (
        <Panel className="w-[300px] max-w-[calc(100vw-24px)] px-3 py-2.5">
          <div className="grid grid-cols-3 gap-x-3 gap-y-2">
            <Stat label="Active fish" value={s.fishCount.toLocaleString()} />
            <Stat label="Schools" value={String(s.schools)} sub={s.stragglers ? `+${s.stragglers} loose` : undefined} />
            <Stat label="Mean speed" value={s.avgSpeed.toFixed(2)} sub="m/s" />
            <Stat label="Nearest nbr" value={(s.avgNND * 100).toFixed(0)} sub="cm" />
            <Stat label="Packing" value={s.density.toFixed(0)} sub="fish/m³" />
            <Stat label="FPS" value={perf.fps.toFixed(0)} sub={`sim ${perf.simStepMs.toFixed(1)}ms`} />
          </div>
          <div className="mt-2.5 space-y-1.5 text-[11px] text-slate-300">
            <div>
              <div className="flex justify-between">
                <span title="Length of the mean heading vector of all fish (1 = all parallel)">Polarization (all)</span>
                <span className="font-mono">{s.polarization.toFixed(2)}</span>
              </div>
              <Bar value={s.polarization} />
            </div>
            {s.largest && (
              <>
                <div>
                  <div className="flex justify-between">
                    <span>Largest school polarization</span>
                    <span className="font-mono">{s.largest.polarization.toFixed(2)}</span>
                  </div>
                  <Bar value={s.largest.polarization} />
                </div>
                <div>
                  <div className="flex justify-between">
                    <span title="Couzin rotation order: ~1 when fish circle a common centre">Rotation (milling)</span>
                    <span className="font-mono">{s.largest.rotation.toFixed(2)}</span>
                  </div>
                  <Bar value={s.largest.rotation} color="bg-violet-300" />
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>
                    Largest: {s.largest.count} fish · r {s.largest.radius.toFixed(1)} m · stretch {s.largest.elongation.toFixed(1)}×
                  </span>
                </div>
              </>
            )}
            <div>
              <div className="flex justify-between">
                <span>Alarmed fish</span>
                <span className="font-mono">{(s.alarmedFraction * 100).toFixed(0)}%</span>
              </div>
              <Bar value={s.alarmedFraction} color="bg-rose-300" />
            </div>
            {s.feedingFraction > 0.005 && (
              <div>
                <div className="flex justify-between">
                  <span>Feeding</span>
                  <span className="font-mono">{(s.feedingFraction * 100).toFixed(0)}%</span>
                </div>
                <Bar value={s.feedingFraction} color="bg-lime-300" />
              </div>
            )}
            <div className="flex justify-between border-t border-white/10 pt-1.5">
              <span>Predators</span>
              <span>
                {s.predators > 0 ? `${s.predators} · ${s.predatorActivity}` : 'None'}
                {s.attempts > 0 && <span className="text-slate-400"> · {s.captures}/{s.attempts} strikes</span>}
              </span>
            </div>
          </div>
        </Panel>
      )}
    </div>
  )
}

const CONCEPTS: { title: string; kind: 'observed' | 'model'; text: string }[] = [
  { title: 'Schooling vs. shoaling', kind: 'observed', text: 'Shoals are social groups; schools are shoals that swim in a coordinated, polarized way. Sardines switch between them.' },
  { title: 'Local interactions only', kind: 'model', text: 'Each fish attends to a few nearest schoolmates it can see (rear blind zone) plus very close fish sensed with its lateral line. No fish knows the whole school.' },
  { title: 'Separation · alignment · cohesion', kind: 'model', text: 'Short-range repulsion, matching neighbours’ headings and attraction toward them — the Boids rules — compete in every fish, every step.' },
  { title: 'Information waves', kind: 'observed', text: 'When one fish startles, neighbours copy its evasive movement a moment later, so a wave travels across the school faster than any predator.' },
  { title: 'Selfish herd & bait balls', kind: 'observed', text: 'Threatened fish tighten up and push toward the centre. When predators constrain a school from several sides it can compress into a bait ball.' },
  { title: 'Swimming in moving water', kind: 'model', text: 'Fish steer relative to the water; currents carry everything. The heading you see is not the direction of travel over the seafloor.' },
  { title: 'Flashing silver', kind: 'observed', text: 'Mirror-like scales reflect the bright surface toward you only at certain angles, so turning fish produce rolling bands of light.' },
]

export function InfoPanel() {
  const open = useSimStore((s) => s.panel.info)
  const toggle = useSimStore((s) => s.togglePanel)
  const scenario = useSimStore((s) => getScenario(s.scenario))
  const stats = useSimStore((s) => s.stats)
  const [tab, setTab] = useState<'scenario' | 'science'>('scenario')
  return (
    <div className="pointer-events-auto flex flex-col items-start gap-2">
      <Button onClick={() => toggle('info')} active={open} aria-label="Toggle information panel">
        <span aria-hidden>ⓘ</span> Field notes
      </Button>
      {open && (
        <Panel className="scroll-thin max-h-[calc(100vh-430px)] min-h-[120px] w-[300px] max-w-[calc(100vw-24px)] overflow-y-auto px-3.5 py-3">
          <div className="mb-2 flex gap-1" role="tablist">
            {(['scenario', 'science'] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`rounded-md px-2 py-0.5 text-[11px] ${tab === t ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {t === 'scenario' ? 'This scenario' : 'The science'}
              </button>
            ))}
          </div>
          {tab === 'scenario' ? (
            <div className="space-y-2.5">
              <p className="font-display text-[15px] italic leading-snug text-sky-50/90">{scenario.tagline}</p>
              <p className="text-[12px] leading-relaxed text-slate-300">{scenario.description}</p>
              <div>
                <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">What to watch for</h4>
                <ul className="space-y-1 text-[12px] text-slate-300">
                  {scenario.observe.map((o) => (
                    <li key={o} className="flex gap-2">
                      <span className="text-amber-200/80">·</span>
                      {o}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg bg-white/5 p-2">
                <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Right now</div>
                <div className="text-[13px] text-amber-100">{stats.formation}</div>
                <p className="text-[11px] leading-snug text-slate-400">{stats.formationDetail}</p>
                <p className="mt-1 text-[10px] text-slate-500">Classified from measured polarization, rotation, density and alarm — not scripted.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {CONCEPTS.map((c) => (
                <div key={c.title}>
                  <div className="flex items-center gap-2">
                    <h4 className="text-[12px] font-medium text-slate-100">{c.title}</h4>
                    <Badge kind={c.kind} />
                  </div>
                  <p className="text-[11.5px] leading-relaxed text-slate-300">{c.text}</p>
                </div>
              ))}
              <p className="border-t border-white/10 pt-2 text-[10.5px] leading-relaxed text-slate-400">
                <Badge kind="observed" /> marks behaviour documented in wild fish. <Badge kind="model" /> marks simplifications of this simulation: sensory ranges, steering
                weights, predator tactics and lateral-line responses are tunable approximations, not measured biological constants.
              </p>
            </div>
          )}
        </Panel>
      )}
    </div>
  )
}

function Meter({ label, value, max = 1, unit = '', color = 'bg-sky-300' }: { label: string; value: number; max?: number; unit?: string; color?: string }) {
  return (
    <div>
      <div className="flex justify-between text-[11px] text-slate-300">
        <span>{label}</span>
        <span className="font-mono">
          {value.toFixed(2)}
          {unit}
        </span>
      </div>
      <Bar value={value / max} color={color} />
    </div>
  )
}

export function Inspector() {
  const sel = useSimStore((s) => s.selected)
  const selectedId = useSimStore((s) => s.selectedId)
  const select = useSimStore((s) => s.select)
  const camera = useSimStore((s) => s.camera)
  const setCamera = useSimStore((s) => s.setCamera)
  const overlays = useSimStore((s) => s.overlays)
  const setOverlay = useSimStore((s) => s.setOverlay)
  if (selectedId < 0) return null
  const heading = sel ? ((Math.atan2(sel.dx, sel.dz) * 180) / Math.PI + 360) % 360 : 0
  const pitch = sel ? (Math.asin(Math.max(-1, Math.min(1, sel.dy))) * 180) / Math.PI : 0
  return (
    <Panel className="pointer-events-auto w-[260px] px-3 py-2.5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Sardine</div>
          <div className="font-mono text-[15px] text-white">#{selectedId}</div>
        </div>
        <button onClick={() => select(-1)} className="rounded-md px-2 py-1 text-[12px] text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Close inspector">
          ✕
        </button>
      </div>
      {!sel ? (
        <p className="py-2 text-[12px] text-slate-400">Reading sensors…</p>
      ) : !sel.alive ? (
        <p className="py-2 text-[12px] text-rose-200">Captured{sel.capturedBy ? ` by a ${sel.capturedBy.toLowerCase()}` : ''}. It has been removed from the population.</p>
      ) : (
        <div className="mt-1.5 space-y-1.5">
          <div className="rounded-md bg-white/5 px-2 py-1 text-[12px] text-amber-100">{sel.behavior}</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <Stat label="Speed" value={sel.speed.toFixed(2)} sub={`m/s · ${(sel.speed / 0.2).toFixed(1)} BL/s`} />
            <Stat label="Heading" value={`${heading.toFixed(0)}°`} sub={`pitch ${pitch.toFixed(0)}°`} />
            <Stat label="Neighbours" value={String(sel.neighbors)} sub={`nearest ${(sel.nearestNeighbor * 100).toFixed(0)} cm`} />
            <Stat label="Depth" value={(-sel.y).toFixed(1)} sub="m" />
            <Stat label="Predator" value={Number.isFinite(sel.nearestPredator) ? `${sel.nearestPredator.toFixed(1)} m` : 'none'} />
            <Stat label="Hunger" value={sel.hunger.toFixed(2)} sub={sel.feeding > 0 ? 'feeding' : ''} />
          </div>
          <Meter label="Perceived threat" value={sel.threat} color="bg-rose-300" />
          <Meter label="Alarm (incl. from neighbours)" value={sel.alarm} color="bg-orange-300" />
          <Meter label="Fatigue" value={sel.fatigue} color="bg-slate-300" />
          <div className="border-t border-white/10 pt-1.5">
            <div className="mb-0.5 text-[10px] uppercase tracking-[0.16em] text-slate-400">Steering terms (weighted)</div>
            <Meter label="Separation" value={sel.weights.separation} max={3} color="bg-[#ff5a4d]" />
            <Meter label="Alignment" value={sel.weights.alignment} max={3} color="bg-[#66ff80]" />
            <Meter label="Cohesion" value={sel.weights.cohesion} max={3} color="bg-[#ffd94d]" />
            <Meter label="Predator avoidance" value={sel.weights.avoidance} max={3} color="bg-[#ff4de6]" />
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <Button onClick={() => setCamera(camera === 'individual' ? 'cinematic' : 'individual')} active={camera === 'individual'}>
              Follow
            </Button>
            <Button onClick={() => setOverlay({ neighborhoods: !overlays.neighborhoods })} active={overlays.neighborhoods}>
              Senses
            </Button>
          </div>
        </div>
      )}
    </Panel>
  )
}

export function Toasts() {
  const toasts = useSimStore((s) => s.toasts)
  const dismiss = useSimStore((s) => s.dismissToast)
  return (
    <div className="pointer-events-none flex flex-col items-end gap-1.5" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto animate-[fadein_.3s_ease-out] rounded-lg border px-3 py-1.5 text-[12px] backdrop-blur-md ${
            t.tone === 'warn'
              ? 'border-amber-300/30 bg-amber-950/50 text-amber-100'
              : t.tone === 'capture'
                ? 'border-rose-300/20 bg-slate-950/50 text-rose-100'
                : 'border-white/10 bg-slate-950/50 text-slate-100'
          }`}
          onClick={() => dismiss(t.id)}
        >
          {t.text}
        </div>
      ))}
    </div>
  )
}

export function SimToolbar() {
  const paused = useSimStore((s) => s.paused)
  const slow = useSimStore((s) => s.slowMotion)
  const setPaused = useSimStore((s) => s.setPaused)
  const toggleSlow = useSimStore((s) => s.toggleSlowMotion)
  const reset = useSimStore((s) => s.reset)
  return (
    <div className="pointer-events-auto flex gap-1.5">
      <Button onClick={() => setPaused(!paused)} active={paused} aria-label={paused ? 'Resume' : 'Pause'} title="Pause / resume (Space)">
        {paused ? '▶' : '❚❚'}
      </Button>
      <Button onClick={toggleSlow} active={slow} title="Slow motion (S)" aria-label="Slow motion">
        ¼×
      </Button>
      <Button onClick={reset} title="Reset scenario (R)" aria-label="Reset scenario">
        ↺
      </Button>
      <Button onClick={() => screenshotRef.current?.()} title="Screenshot (P)" aria-label="Screenshot">
        ◉
      </Button>
    </div>
  )
}

export function LoadingScreen() {
  const ready = useSimStore((s) => s.ready)
  const [gone, setGone] = useState(false)
  useEffect(() => {
    if (!ready) return
    const t = setTimeout(() => setGone(true), 1400)
    return () => clearTimeout(t)
  }, [ready])
  if (gone) return null
  return (
    <div
      className={`pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-b from-[#0b4a5e] via-[#062a3a] to-[#010a12] transition-opacity duration-1000 ${
        ready ? 'opacity-0' : 'opacity-100'
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="font-display text-[34px] tracking-wide text-white">Sardine School</div>
      <div className="mt-1 text-[11px] uppercase tracking-[0.32em] text-sky-100/70">A Living Ocean</div>
      <div className="mt-8 h-px w-40 overflow-hidden bg-white/10">
        <div className="h-full w-1/3 animate-[slide_1.4s_ease-in-out_infinite] bg-sky-200/70" />
      </div>
      <div className="mt-3 text-[12px] text-sky-100/60">Descending…</div>
    </div>
  )
}
