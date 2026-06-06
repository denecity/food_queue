import { useRef, useState } from 'react'
import type { Health, Ingredient, Perishability, Recipe, RecipeDraft } from '../lib/types'
import { api } from '../lib/api'
import { toast } from '../lib/toast'
import { EFFORT_LABELS, HEALTH_OPTIONS, PERISH_OPTIONS, recipeGradient, recipeImageUrl } from '../lib/ui'
import { Segmented } from './Segmented'
import { TagPicker } from './TagPicker'
import { IngredientEditor } from './IngredientEditor'

interface Draft {
  name: string
  emoji: string
  description: string
  cuisine: string
  servings: number
  effort: number
  perishability: Perishability
  health: Health
  yumminess: number
  prep_minutes: number | null
  cook_minutes: number | null
  instructions: string
  notes: string
  tags: string[]
  ingredients: Ingredient[]
}

function toDraft(r: Recipe | null): Draft {
  return {
    name: r?.name ?? '',
    emoji: r?.emoji ?? '🍽️',
    description: r?.description ?? '',
    cuisine: r?.cuisine ?? '',
    servings: r?.servings ?? 5,
    effort: r?.effort ?? 2,
    perishability: r?.perishability ?? 'mid',
    health: r?.health ?? 'mid',
    yumminess: r?.yumminess ?? 5,
    prep_minutes: r?.prep_minutes ?? null,
    cook_minutes: r?.cook_minutes ?? null,
    instructions: r?.instructions ?? '',
    notes: r?.notes ?? '',
    tags: r?.tags ?? [],
    ingredients: r?.ingredients ?? [],
  }
}

export function RecipeEditor({
  recipe,
  onClose,
  onSaved,
  onDeleted,
}: {
  recipe: Recipe | null
  onClose: () => void
  onSaved: () => void
  onDeleted: (id: string) => void
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(recipe))
  const [currentId, setCurrentId] = useState<string | null>(recipe?.id ?? null)
  const [imgKey, setImgKey] = useState<string | null>(recipe?.image_key ?? null)
  const [imgVersion, setImgVersion] = useState(recipe?.updated_at ?? '')
  const [saving, setSaving] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))

  function payload(): RecipeDraft {
    return {
      name: draft.name.trim(),
      emoji: draft.emoji || '🍽️',
      description: draft.description.trim() || null,
      cuisine: draft.cuisine.trim() || null,
      servings: draft.servings,
      effort: draft.effort,
      perishability: draft.perishability,
      health: draft.health,
      yumminess: draft.yumminess,
      prep_minutes: draft.prep_minutes,
      cook_minutes: draft.cook_minutes,
      instructions: draft.instructions.trim() || null,
      notes: draft.notes.trim() || null,
      tags: draft.tags,
      ingredients: draft.ingredients.filter((i) => i.name.trim()),
      source: recipe?.source ?? 'manual',
    }
  }

  async function save() {
    if (!draft.name.trim()) {
      toast('Give the recipe a name', 'error')
      return
    }
    setSaving(true)
    try {
      if (currentId) await api.recipes.update(currentId, payload())
      else {
        const created = await api.recipes.create(payload())
        setCurrentId(created.id)
      }
      toast('Saved', 'success')
      onSaved()
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function del() {
    if (!currentId) return onClose()
    if (!confirm(`Delete "${draft.name}"?`)) return
    try {
      await api.recipes.remove(currentId)
      onDeleted(currentId)
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Delete failed', 'error')
    }
  }

  async function generate() {
    if (!prompt.trim()) return
    setGenerating(true)
    try {
      const r = await api.generate(prompt.trim())
      setDraft((d) => ({
        ...d,
        name: r.name ?? d.name,
        emoji: r.emoji ?? d.emoji,
        description: r.description ?? d.description,
        cuisine: r.cuisine ?? d.cuisine,
        servings: r.servings ?? d.servings,
        effort: r.effort ?? d.effort,
        perishability: (r.perishability as Perishability) ?? d.perishability,
        health: (r.health as Health) ?? d.health,
        yumminess: r.yumminess ?? d.yumminess,
        prep_minutes: r.prep_minutes ?? d.prep_minutes,
        cook_minutes: r.cook_minutes ?? d.cook_minutes,
        instructions: r.instructions ?? d.instructions,
        tags: r.tags ?? d.tags,
        ingredients: (r.ingredients ?? d.ingredients).map((i) => ({
          name: i.name, quantity: i.quantity ?? null, unit: i.unit ?? null,
          category: i.category ?? 'other', note: i.note ?? null,
        })),
      }))
      toast('Draft generated — review & save', 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Generation failed', 'error')
    } finally {
      setGenerating(false)
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !currentId) return
    try {
      const res = await api.recipes.uploadImage(currentId, file)
      setImgKey(res.image_key)
      setImgVersion(res.updated_at)
      toast('Photo uploaded', 'success')
      onSaved()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Upload failed', 'error')
    }
  }

  const img = imgKey ? recipeImageUrl({ image_key: imgKey, updated_at: imgVersion }) : null

  return (
    <div className="fixed inset-0 z-50 bg-bg-base overflow-y-auto animate-fade-in">
      <div className="max-w-2xl mx-auto px-4 pb-32 pt-safe">
        <header className="sticky top-0 -mx-4 px-4 py-3 bg-bg-base/95 backdrop-blur flex items-center justify-between border-b border-line z-10">
          <button onClick={onClose} className="btn-ghost !px-3">✕</button>
          <h2 className="font-bold text-ink">{currentId ? 'Edit recipe' : 'New recipe'}</h2>
          <button onClick={save} disabled={saving} className="btn-primary !px-4 !py-2 disabled:opacity-50">
            {saving ? '…' : 'Save'}
          </button>
        </header>

        <div className="space-y-5 pt-4">
          {/* AI generate */}
          <div className="card p-3 space-y-2 border-accent/30">
            <label className="label !mb-0 flex items-center gap-1">✨ Generate with Claude</label>
            <p className="text-xs text-ink-dim">Describe a dish — it fills the form below as an editable draft.</p>
            <textarea
              className="field min-h-[60px]"
              placeholder="e.g. cozy korean soft tofu stew for cold weather, 5 servings"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <button onClick={generate} disabled={generating || !prompt.trim()} className="btn-primary w-full disabled:opacity-50">
              {generating ? 'Generating…' : '✨ Generate draft'}
            </button>
          </div>

          {/* Name + emoji */}
          <div className="flex gap-2">
            <input
              className="field w-16 text-center text-2xl"
              value={draft.emoji}
              onChange={(e) => set('emoji', e.target.value)}
              aria-label="Emoji"
            />
            <input
              className="field text-lg font-semibold"
              placeholder="Recipe name"
              value={draft.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </div>

          <div>
            <label className="label">Description</label>
            <input className="field" placeholder="One enticing line" value={draft.description} onChange={(e) => set('description', e.target.value)} />
          </div>

          {/* Photo */}
          <div>
            <label className="label">Photo</label>
            {currentId ? (
              <div className="flex items-center gap-3">
                <div className="w-24 h-24 rounded-xl overflow-hidden border border-line flex items-center justify-center shrink-0"
                  style={img ? undefined : { background: recipeGradient({ id: currentId, name: draft.name }) }}>
                  {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : <span className="text-4xl">{draft.emoji}</span>}
                </div>
                <div className="flex flex-col gap-2">
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
                  <button type="button" className="btn-ghost text-sm" onClick={() => fileRef.current?.click()}>📷 {img ? 'Replace' : 'Upload'} photo</button>
                  {img && (
                    <button type="button" className="text-skip text-sm" onClick={async () => { await api.recipes.removeImage(currentId); setImgKey(null); onSaved() }}>Remove</button>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-ink-dim">Save the recipe first, then reopen to add a photo.</p>
            )}
          </div>

          {/* Ratings */}
          <div className="space-y-3">
            <div>
              <label className="label">Yumminess — <span className="text-amber-400">{draft.yumminess}</span>/10</label>
              <input type="range" min={0} max={10} value={draft.yumminess} onChange={(e) => set('yumminess', Number(e.target.value))} className="w-full accent-accent" />
            </div>
            <div>
              <label className="label">Effort — {EFFORT_LABELS[draft.effort]}</label>
              <Segmented value={draft.effort} onChange={(v) => set('effort', v)}
                options={EFFORT_LABELS.map((_, i) => ({ value: i, label: String(i) }))} />
            </div>
            <div>
              <label className="label">Perishability</label>
              <Segmented value={draft.perishability} onChange={(v) => set('perishability', v)}
                options={PERISH_OPTIONS.map((o) => ({ value: o.value, label: o.label, color: o.color }))} />
            </div>
            <div>
              <label className="label">Health</label>
              <Segmented value={draft.health} onChange={(v) => set('health', v)}
                options={HEALTH_OPTIONS.map((o) => ({ value: o.value, label: o.emoji, color: o.color }))} />
            </div>
          </div>

          {/* Meta row */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="label">Servings</label>
              <input className="field text-center" inputMode="numeric" value={draft.servings} onChange={(e) => set('servings', Number(e.target.value) || 1)} />
            </div>
            <div>
              <label className="label">Prep min</label>
              <input className="field text-center" inputMode="numeric" value={draft.prep_minutes ?? ''} onChange={(e) => set('prep_minutes', e.target.value === '' ? null : Number(e.target.value))} />
            </div>
            <div>
              <label className="label">Cook min</label>
              <input className="field text-center" inputMode="numeric" value={draft.cook_minutes ?? ''} onChange={(e) => set('cook_minutes', e.target.value === '' ? null : Number(e.target.value))} />
            </div>
          </div>

          <div>
            <label className="label">Cuisine</label>
            <input className="field" placeholder="e.g. korean" value={draft.cuisine} onChange={(e) => set('cuisine', e.target.value)} />
          </div>

          <div>
            <label className="label">Tags</label>
            <TagPicker tags={draft.tags} onChange={(t) => set('tags', t)} />
          </div>

          <div>
            <label className="label">Ingredients</label>
            <IngredientEditor ingredients={draft.ingredients} onChange={(i) => set('ingredients', i)} />
          </div>

          <div>
            <label className="label">Instructions</label>
            <textarea className="field min-h-[140px] font-mono text-sm" placeholder={'1. …\n2. …'} value={draft.instructions} onChange={(e) => set('instructions', e.target.value)} />
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea className="field min-h-[60px]" value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>

          {currentId && (
            <button onClick={del} className="w-full text-skip border border-skip/30 rounded-xl py-3 text-sm font-medium hover:bg-skip/10">
              Delete recipe
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
