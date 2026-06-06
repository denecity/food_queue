import type { Recipe } from '../lib/types'
import { effortLabel, healthMeta, perishMeta } from '../lib/ui'

export function RatingChips({ recipe, size = 'sm' }: { recipe: Recipe; size?: 'sm' | 'md' }) {
  const h = healthMeta(recipe.health)
  const p = perishMeta(recipe.perishability)
  const text = size === 'md' ? 'text-sm' : 'text-xs'
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${text}`}>
      <span className="chip" title="Yumminess">
        <span className="text-amber-400">★</span> {recipe.yumminess}
      </span>
      <span className="chip" title={`Effort: ${effortLabel(recipe.effort)}`}>
        ⚡ {recipe.effort}
      </span>
      <span className="chip" title={`${p.label}`} style={{ color: p.color, borderColor: p.color + '55' }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.color }} /> {p.label}
      </span>
      <span className="chip" title={`Health: ${h.label}`}>
        {h.emoji} {h.label}
      </span>
    </div>
  )
}

export function TagRow({ tags }: { tags: string[] }) {
  if (!tags.length) return null
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <span key={t} className="chip-accent text-[11px]">{t}</span>
      ))}
    </div>
  )
}
