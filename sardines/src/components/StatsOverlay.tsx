import { useSimStore } from '../store/useSimStore'

export function StatsOverlay() {
  const stats = useSimStore((s) => s.stats)

  return (
    <div className="pointer-events-none absolute bottom-6 left-6 rounded-lg bg-black/40 px-4 py-3 font-mono text-xs text-white/80 backdrop-blur-sm">
      <div>fish: {stats.fishCount}</div>
      <div>schools detected: {stats.schoolCount}</div>
      <div>avg speed: {stats.avgSpeed.toFixed(2)} m/s</div>
      <div>avg nearest-neighbor: {stats.avgNeighborDistance.toFixed(2)} m</div>
      <div>polarization: {(stats.polarization * 100).toFixed(0)}%</div>
    </div>
  )
}
