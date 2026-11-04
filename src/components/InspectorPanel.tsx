import { useSimStore } from '../store/useSimStore'

export function InspectorPanel() {
  const stats = useSimStore((s) => s.selectedFishStats)
  const setSelectedFishIndex = useSimStore((s) => s.setSelectedFishIndex)

  if (!stats) return null

  return (
    <div className="pointer-events-auto absolute bottom-6 right-6 w-56 rounded-lg bg-black/50 p-3 font-mono text-xs text-white/85 backdrop-blur-sm">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-widest text-white/50">Sardine #{stats.id}</span>
        <button
          className="text-white/50 hover:text-white"
          onClick={() => setSelectedFishIndex(-1)}
        >
          ✕
        </button>
      </div>
      <div>swim speed: {stats.speed.toFixed(2)} m/s</div>
      <div>
        swim heading: [{stats.heading.map((v) => v.toFixed(2)).join(', ')}]
      </div>
      <div>ground speed: {stats.groundSpeed.toFixed(2)} m/s</div>
      <div>
        ground heading: [{stats.groundHeading.map((v) => v.toFixed(2)).join(', ')}]
      </div>
      <div>neighbors: {stats.neighborCount}</div>
      <div>
        nearest predator:{' '}
        {Number.isFinite(stats.nearestPredatorDist) ? `${stats.nearestPredatorDist.toFixed(1)} m` : '—'}
      </div>
      <div>threat level: {(stats.threatLevel * 100).toFixed(0)}%</div>
      <div>forage level: {(stats.forageLevel * 100).toFixed(0)}%</div>
    </div>
  )
}
