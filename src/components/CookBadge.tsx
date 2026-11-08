/** "% of ingredients in stock" pill. Hidden when the recipe has no tracked ingredients. */
export function CookBadge({
  entry,
  className,
}: {
  entry?: { have: number; total: number }
  className?: string
}) {
  if (!entry || entry.total <= 0) return null
  const pct = Math.round((entry.have / entry.total) * 100)
  const ready = pct >= 100
  const tone = ready
    ? 'bg-like/20 text-like'
    : pct >= 50
      ? 'bg-amber-500/15 text-amber-400'
      : 'bg-bg-hover text-ink-dim'
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded ${tone} ${className ?? ''}`}
      title={`${entry.have}/${entry.total} ingredients in stock`}
    >
      🥫 {ready ? 'ready' : `${pct}%`}
    </span>
  )
}
