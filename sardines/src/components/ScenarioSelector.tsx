import { SCENARIOS } from '../sim/scenarios'
import { useSimStore } from '../store/useSimStore'

export function ScenarioSelector() {
  const activeScenario = useSimStore((s) => s.activeScenario)
  const applyScenario = useSimStore((s) => s.applyScenario)

  return (
    <div className="pointer-events-auto absolute left-6 top-1/2 flex w-44 -translate-y-1/2 flex-col gap-1 rounded-lg bg-black/40 p-3 backdrop-blur-sm">
      <span className="mb-1 text-[11px] uppercase tracking-widest text-white/50">Scenario</span>
      {SCENARIOS.map((scenario) => (
        <button
          key={scenario.key}
          onClick={() => applyScenario(scenario.key)}
          title={scenario.description}
          className={`rounded px-2 py-1 text-left text-xs transition-colors ${
            activeScenario === scenario.key
              ? 'bg-white/20 text-white'
              : 'text-white/60 hover:bg-white/10 hover:text-white/90'
          }`}
        >
          {scenario.label}
        </button>
      ))}
    </div>
  )
}
