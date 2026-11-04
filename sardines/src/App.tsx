import { ControlPanel } from './components/ControlPanel'
import { Scene } from './components/Scene'
import { StatsOverlay } from './components/StatsOverlay'
import { ScenarioSelector } from './components/ScenarioSelector'
import { QualityToast } from './components/QualityToast'
import { InspectorPanel } from './components/InspectorPanel'

function App() {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black text-white">
      <Scene />
      <ControlPanel />
      <StatsOverlay />
      <ScenarioSelector />
      <QualityToast />
      <InspectorPanel />

      <div className="pointer-events-none absolute left-0 top-0 w-full p-6">
        <h1 className="font-serif text-2xl tracking-wide text-white/90 drop-shadow-lg">
          Sardine School
        </h1>
        <p className="text-sm text-white/60">A Living Ocean — autonomous schooling simulation</p>
      </div>
    </div>
  )
}

export default App
