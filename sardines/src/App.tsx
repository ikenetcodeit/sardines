import { useEffect } from 'react'
import { screenshotRef, Scene } from './render/Scene'
import { useSimStore } from './store/useSimStore'
import { ControlPanel } from './ui/ControlPanel'
import { InfoPanel, Inspector, LoadingScreen, ScenarioBar, SimToolbar, StatsPanel, Toasts, TopBar } from './ui/Panels'

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (/INPUT|SELECT|TEXTAREA/.test(t.tagName) || e.metaKey || e.ctrlKey || e.altKey) return
      const st = useSimStore.getState()
      if (st.camera === 'drone' && /^[wasdqec ]$|^arrow/i.test(e.key)) return
      if (e.key === ' ') {
        e.preventDefault()
        st.setPaused(!st.paused)
      } else if (e.key === 's') st.toggleSlowMotion()
      else if (e.key === 'r') st.reset()
      else if (e.key === 'p') screenshotRef.current?.()
      else if (e.key === 'Escape') st.select(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export default function App() {
  useShortcuts()
  return (
    <main className="relative h-full w-full overflow-hidden bg-[#04121c]">
      <Scene />
      <div className="vignette pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 flex flex-col p-3 sm:p-4">
        <TopBar />
        <div className="mt-3 flex min-h-0 flex-1 justify-between gap-3">
          <div className="flex min-h-0 flex-col gap-2">
            <InfoPanel />
            <Inspector />
          </div>
          <div className="flex min-h-0 flex-col items-end gap-2">
            <ControlPanel />
          </div>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <StatsPanel />
          <div className="order-last flex w-full justify-center sm:order-none sm:w-auto">
            <ScenarioBar />
          </div>
          <div className="flex flex-col items-end gap-2">
            <Toasts />
            <SimToolbar />
          </div>
        </div>
      </div>
      <LoadingScreen />
    </main>
  )
}
