import { useEffect, useState } from 'react'

export interface Toast {
  id: number
  message: string
  kind: 'info' | 'success' | 'error'
}

type Listener = (toasts: Toast[]) => void

let toasts: Toast[] = []
const listeners = new Set<Listener>()
let nextId = 1

function emit() {
  for (const l of listeners) l(toasts)
}

export function toast(message: string, kind: Toast['kind'] = 'info') {
  const t: Toast = { id: nextId++, message, kind }
  toasts = [...toasts, t]
  emit()
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id)
    emit()
  }, 3000)
}

export function ToastContainer() {
  const [items, setItems] = useState<Toast[]>(toasts)
  useEffect(() => {
    listeners.add(setItems)
    return () => {
      listeners.delete(setItems)
    }
  }, [])

  return (
    <div className="fixed left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-[92%] max-w-sm"
      style={{ bottom: 'calc(var(--nav-h) + var(--safe-bottom) + 12px)' }}>
      {items.map((t) => (
        <div
          key={t.id}
          className={`animate-fade-in rounded-xl px-4 py-3 text-sm font-medium shadow-card border ${
            t.kind === 'error'
              ? 'bg-[#3a1a1a] border-red-800 text-red-200'
              : t.kind === 'success'
                ? 'bg-[#15301f] border-green-800 text-green-200'
                : 'bg-bg-elevated border-line text-ink'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
