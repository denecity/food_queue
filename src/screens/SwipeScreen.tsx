import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import type { Recipe } from '../lib/types'
import { toast } from '../lib/toast'
import { SwipeDeck } from '../components/SwipeDeck'

const FILTERS = ['all', 'hot weather', 'cold weather', 'quick', 'high effort']

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function SwipeScreen({
  pickIds,
  onPick,
  onTap,
}: {
  pickIds: Set<string>
  onPick: (recipeId: string) => Promise<unknown>
  onTap: (recipe: Recipe) => void
}) {
  const [all, setAll] = useState<Recipe[]>([])
  const [skipped, setSkipped] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.recipes
      .list({ sort: 'yumminess_desc' })
      .then((r) => setAll(shuffle(r)))
      .catch((e) => toast(e instanceof Error ? e.message : 'Failed to load', 'error'))
      .finally(() => setLoading(false))
  }, [])

  const queue = useMemo(
    () =>
      all.filter(
        (r) =>
          !pickIds.has(r.id) &&
          !skipped.has(r.id) &&
          (filter === 'all' || r.tags.includes(filter))
      ),
    [all, pickIds, skipped, filter]
  )

  async function decide(recipe: Recipe, dir: 'like' | 'skip') {
    if (dir === 'like') {
      await onPick(recipe.id)
      toast(`Picked ${recipe.emoji} ${recipe.name}`, 'success')
    } else {
      setSkipped((s) => new Set(s).add(recipe.id))
    }
  }

  return (
    <div className="px-4 pt-4 space-y-4">
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium capitalize transition-colors ${
              filter === f ? 'bg-accent text-white' : 'bg-bg-elevated text-ink-dim'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-20 text-ink-dim">Loading…</div>
      ) : queue.length === 0 ? (
        <div className="text-center py-20 text-ink-dim space-y-2">
          <div className="text-5xl">🎉</div>
          <p>No more dishes to swipe{filter !== 'all' ? ` in "${filter}"` : ''}.</p>
          {skipped.size > 0 && (
            <button className="btn-ghost text-sm" onClick={() => setSkipped(new Set())}>Reset skipped</button>
          )}
        </div>
      ) : (
        <>
          <SwipeDeck queue={queue} onDecide={decide} onTap={onTap} />
          <div className="flex items-center justify-center gap-6 pt-1">
            <button
              onClick={() => decide(queue[0], 'skip')}
              className="w-16 h-16 rounded-full bg-bg-elevated border border-line text-2xl text-skip active:scale-95 transition-transform"
              aria-label="Skip"
            >
              ✕
            </button>
            <span className="text-xs text-ink-faint">{queue.length} left</span>
            <button
              onClick={() => decide(queue[0], 'like')}
              className="w-16 h-16 rounded-full bg-accent text-white text-2xl active:scale-95 transition-transform shadow-card"
              aria-label="Pick"
            >
              ♥
            </button>
          </div>
        </>
      )}
    </div>
  )
}
