import type { ReactNode } from 'react'

/** A bottom sheet modal: tap-outside / ✕ to close, scrollable body, optional footer. */
export function Sheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-2xl bg-bg-card rounded-t-2xl max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'var(--safe-bottom)' }}
      >
        <div className="px-4 pt-4 pb-2 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          <button onClick={onClose} className="text-ink-faint text-xl leading-none px-1">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">{children}</div>
        {footer && <div className="shrink-0 px-4 py-3 border-t border-line flex gap-2">{footer}</div>}
      </div>
    </div>
  )
}
