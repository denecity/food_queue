import { useEffect, useRef, useState } from 'react'
import type { Recipe } from '../lib/types'
import { recipeGradient, recipeImageUrl } from '../lib/ui'
import { RatingChips, TagRow } from './RatingChips'

type Dir = 'like' | 'skip'
const THRESHOLD = 110

export function SwipeDeck({
  queue,
  onDecide,
  onTap,
}: {
  queue: Recipe[]
  onDecide: (recipe: Recipe, dir: Dir) => void
  onTap: (recipe: Recipe) => void
}) {
  const [drag, setDrag] = useState({ x: 0, y: 0 })
  const [leaving, setLeaving] = useState<Dir | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const moved = useRef(false)

  const top = queue[0]
  const topId = top?.id

  // Reset transient state whenever a new card reaches the top.
  useEffect(() => {
    setDrag({ x: 0, y: 0 })
    setLeaving(null)
    start.current = null
    moved.current = false
  }, [topId])

  if (!top) return null

  function fling(dir: Dir) {
    if (leaving) return
    setLeaving(dir)
    setDrag({ x: dir === 'like' ? window.innerWidth : -window.innerWidth, y: 0 })
    const r = top
    setTimeout(() => onDecide(r, dir), 240)
  }

  function onDown(e: React.PointerEvent) {
    if (leaving) return
    start.current = { x: e.clientX, y: e.clientY }
    moved.current = false
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  function onMove(e: React.PointerEvent) {
    if (!start.current || leaving) return
    const x = e.clientX - start.current.x
    const y = e.clientY - start.current.y
    if (Math.abs(x) > 6 || Math.abs(y) > 6) moved.current = true
    setDrag({ x, y })
  }
  function onUp() {
    if (!start.current || leaving) return
    if (drag.x > THRESHOLD) fling('like')
    else if (drag.x < -THRESHOLD) fling('skip')
    else setDrag({ x: 0, y: 0 })
    start.current = null
  }

  const rot = drag.x / 18
  const likeOpacity = Math.min(1, Math.max(0, drag.x / THRESHOLD))
  const skipOpacity = Math.min(1, Math.max(0, -drag.x / THRESHOLD))

  return (
    <div className="relative w-full" style={{ height: 'min(64vh, 520px)' }}>
      {queue.slice(0, 3).reverse().map((r, idxFromBack, arr) => {
        const depth = arr.length - 1 - idxFromBack // 0 = top
        const isTop = depth === 0
        const img = recipeImageUrl(r)
        return (
          <div
            key={r.id}
            className="absolute inset-0 select-none touch-none"
            onPointerDown={isTop ? onDown : undefined}
            onPointerMove={isTop ? onMove : undefined}
            onPointerUp={isTop ? onUp : undefined}
            onClick={isTop ? () => { if (!moved.current) onTap(r) } : undefined}
            style={{
              transform: isTop
                ? `translate(${drag.x}px, ${drag.y}px) rotate(${rot}deg)`
                : `scale(${1 - depth * 0.04}) translateY(${depth * 12}px)`,
              transition: isTop && start.current ? 'none' : 'transform 0.24s ease-out',
              zIndex: 10 - depth,
            }}
          >
            <div className="w-full h-full rounded-xl2 overflow-hidden border border-line shadow-deck bg-bg-card flex flex-col">
              <div
                className="relative flex-1 flex items-center justify-center"
                style={img ? undefined : { background: recipeGradient(r) }}
              >
                {img ? (
                  <img src={img} alt={r.name} className="absolute inset-0 w-full h-full object-cover" draggable={false} />
                ) : (
                  <span className="text-[7rem] drop-shadow-lg">{r.emoji}</span>
                )}
                <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/80 to-transparent" />
                {isTop && (
                  <>
                    <Stamp text="PICK" color="#4ade80" rot={-12} className="left-5 top-5" opacity={likeOpacity} />
                    <Stamp text="SKIP" color="#f87171" rot={12} className="right-5 top-5" opacity={skipOpacity} />
                  </>
                )}
                <div className="absolute bottom-3 left-4 right-4">
                  <h2 className="text-2xl font-bold text-white drop-shadow">{r.emoji} {r.name}</h2>
                  {r.cuisine && <p className="text-white/80 text-sm capitalize">{r.cuisine}</p>}
                </div>
              </div>
              <div className="p-4 space-y-2 bg-bg-card">
                {r.description && <p className="text-sm text-ink-soft line-clamp-2">{r.description}</p>}
                <RatingChips recipe={r} />
                <TagRow tags={r.tags} />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Stamp({ text, color, rot, className, opacity }: { text: string; color: string; rot: number; className: string; opacity: number }) {
  return (
    <div
      className={`absolute ${className} font-extrabold text-3xl tracking-widest border-4 rounded-lg px-3 py-1`}
      style={{ color, borderColor: color, transform: `rotate(${rot}deg)`, opacity }}
    >
      {text}
    </div>
  )
}
