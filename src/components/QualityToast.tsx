import { useEffect } from 'react'
import { useSimStore } from '../store/useSimStore'

export function QualityToast() {
  const qualityNotice = useSimStore((s) => s.qualityNotice)
  const setQualityNotice = useSimStore((s) => s.setQualityNotice)

  useEffect(() => {
    if (!qualityNotice) return
    const timer = setTimeout(() => setQualityNotice(null), 4000)
    return () => clearTimeout(timer)
  }, [qualityNotice, setQualityNotice])

  if (!qualityNotice) return null

  return (
    <div className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded-lg bg-black/60 px-4 py-2 text-xs text-white/90 backdrop-blur-sm">
      {qualityNotice}
    </div>
  )
}
