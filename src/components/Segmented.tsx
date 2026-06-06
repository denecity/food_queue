export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string; color?: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-1 bg-bg-base border border-line rounded-xl p-1">
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => onChange(o.value)}
            className={`flex-1 py-2 px-1 rounded-lg text-xs font-semibold transition-colors ${
              on ? 'text-white' : 'text-ink-dim hover:text-ink-soft'
            }`}
            style={on ? { background: o.color ?? '#f0613d' } : undefined}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
