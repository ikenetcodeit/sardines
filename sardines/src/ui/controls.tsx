import { useId, useState, type ReactNode } from 'react'

export function Panel({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-slate-950/45 text-slate-100 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.6)] backdrop-blur-md ${className}`}>
      {children}
    </div>
  )
}

export function Slider(props: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  digits?: number
  hint?: string
  onChange: (v: number) => void
}) {
  const id = useId()
  const { label, value, min, max, step = 0.01, unit = '', digits = 2, hint, onChange } = props
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="py-1.5">
      <div className="flex items-baseline justify-between gap-2 text-[12px]">
        <label htmlFor={id} className="text-slate-300" title={hint}>
          {label}
        </label>
        <span className="font-mono tabular-nums text-slate-100/90">
          {value.toFixed(digits)}
          {unit && <span className="ml-0.5 text-slate-400">{unit}</span>}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="range mt-1 w-full"
        style={{ ['--pct' as string]: `${pct}%` }}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      {hint && (
        <p id={`${id}-hint`} className="sr-only">
          {hint}
        </p>
      )}
    </div>
  )
}

export function Toggle(props: { label: string; checked: boolean; onChange: (v: boolean) => void; swatch?: string; hint?: string }) {
  const id = useId()
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-3 py-1.5 text-[12px] text-slate-300" title={props.hint}>
      <span className="flex items-center gap-2">
        {props.swatch && <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: props.swatch }} />}
        {props.label}
      </span>
      <span className="relative inline-flex">
        <input id={id} type="checkbox" className="peer sr-only" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
        <span className="h-4.5 w-8 rounded-full bg-white/15 transition-colors peer-checked:bg-sky-400/70 peer-focus-visible:ring-2 peer-focus-visible:ring-sky-300" />
        <span className="absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-3.5" />
      </span>
    </label>
  )
}

export function Select<T extends string>(props: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-[12px]">
      <label htmlFor={id} className="text-slate-300">
        {props.label}
      </label>
      <select
        id={id}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value as T)}
        className="rounded-md border border-white/10 bg-slate-900/80 px-2 py-1 text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
      >
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function Segmented<T extends string>(props: { value: T; options: { value: T; label: string; title?: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={props.label} className="grid grid-cols-3 gap-1 rounded-lg bg-white/5 p-1">
      {props.options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={props.value === o.value}
          title={o.title}
          onClick={() => props.onChange(o.value)}
          className={`rounded-md px-2 py-1.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 ${
            props.value === o.value ? 'bg-sky-400/25 text-white' : 'text-slate-300 hover:bg-white/10'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Button(props: { onClick: () => void; children: ReactNode; title?: string; active?: boolean; className?: string; 'aria-label'?: string }) {
  return (
    <button
      onClick={props.onClick}
      title={props.title}
      aria-label={props['aria-label']}
      aria-pressed={props.active}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 ${
        props.active ? 'border-sky-300/40 bg-sky-400/25 text-white' : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
      } ${props.className ?? ''}`}
    >
      {props.children}
    </button>
  )
}

export function Section({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <div className="border-t border-white/5 pt-2 first:border-t-0 first:pt-0">
      <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{title}</h4>
      {note && <p className="mb-1 text-[11px] leading-snug text-slate-400">{note}</p>}
      {children}
    </div>
  )
}

export function Collapsible({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button className="flex w-full items-center justify-between py-1 text-left text-[12px] text-slate-200" onClick={() => setOpen(!open)} aria-expanded={open}>
        {title}
        <span className="text-slate-400">{open ? '−' : '+'}</span>
      </button>
      {open && <div>{children}</div>}
    </div>
  )
}

export function Badge({ kind }: { kind: 'observed' | 'model' }) {
  return kind === 'observed' ? (
    <span className="rounded bg-emerald-400/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-200">Observed</span>
  ) : (
    <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-200">Model</span>
  )
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="font-mono text-[13px] tabular-nums text-slate-100">
        {value}
        {sub && <span className="ml-1 text-[10px] text-slate-400">{sub}</span>}
      </div>
    </div>
  )
}
