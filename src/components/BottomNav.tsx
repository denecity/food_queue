import type { Tab } from '../lib/types'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'swipe', label: 'Swipe', icon: '🔥' },
  { id: 'plan', label: 'Plan', icon: '📋' },
  { id: 'shop', label: 'Shop', icon: '🛒' },
  { id: 'cook', label: 'Cook', icon: '🍳' },
  { id: 'recipes', label: 'Recipes', icon: '📖' },
]

export function BottomNav({
  active,
  onChange,
  badges,
}: {
  active: Tab
  onChange: (t: Tab) => void
  badges?: Partial<Record<Tab, number>>
}) {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 bg-bg-card/95 backdrop-blur border-t border-line pb-safe"
      style={{ height: 'calc(var(--nav-h) + var(--safe-bottom))' }}
    >
      <div className="max-w-2xl mx-auto h-full grid grid-cols-5" style={{ height: 'var(--nav-h)' }}>
        {TABS.map((t) => {
          const on = active === t.id
          const badge = badges?.[t.id]
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className={`relative flex flex-col items-center justify-center gap-0.5 transition-colors ${
                on ? 'text-accent' : 'text-ink-dim'
              }`}
            >
              <span className="text-xl leading-none">{t.icon}</span>
              <span className="text-[10px] font-medium">{t.label}</span>
              {badge ? (
                <span className="absolute top-1.5 right-[calc(50%-22px)] min-w-4 h-4 px-1 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center">
                  {badge}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
