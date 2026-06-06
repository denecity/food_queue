import { useState } from 'react'
import { CORE_TAGS, CUISINE_TAGS } from '../lib/ui'

export function TagPicker({
  tags,
  onChange,
  suggestions = [],
}: {
  tags: string[]
  onChange: (tags: string[]) => void
  suggestions?: string[]
}) {
  const [input, setInput] = useState('')
  const palette = Array.from(new Set([...CORE_TAGS, ...CUISINE_TAGS, ...suggestions]))

  function toggle(t: string) {
    const tag = t.trim().toLowerCase()
    if (!tag) return
    onChange(tags.includes(tag) ? tags.filter((x) => x !== tag) : [...tags, tag])
  }

  function addCustom() {
    const t = input.trim().toLowerCase()
    if (t && !tags.includes(t)) onChange([...tags, t])
    setInput('')
  }

  return (
    <div className="space-y-2">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <button key={t} type="button" onClick={() => toggle(t)} className="chip-accent">
              {t} <span className="opacity-60">✕</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {palette.filter((t) => !tags.includes(t)).map((t) => (
          <button key={t} type="button" onClick={() => toggle(t)} className="chip">
            + {t}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className="field"
          placeholder="Custom tag…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
        />
        <button type="button" className="btn-ghost shrink-0" onClick={addCustom}>Add</button>
      </div>
    </div>
  )
}
