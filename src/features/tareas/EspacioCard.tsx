// Un espacio con su lista de "limpio". Los admins editan nombre, dificultad,
// minutos y los ítems de la lista.
import { useState, type FormEvent } from 'react'
import { spaceWeight } from '../../core/effort'
import type { ChecklistItem, Space } from '../../hooks/useCatalog'
import { mensajeError } from '../../lib/errors'
import { supabase } from '../../lib/supabase'

const ICONS = ['🍳', '🛁', '🛋️', '🍽️', '🚪', '🪴', '🧺', '🪟', '🐾', '🚗', '🧹', '🗑️']
const DIFICULTAD = ['', 'Fácil', 'Media', 'Difícil']

export function EspacioCard({ space, items, isAdmin, onChange }: {
  space: Space
  items: ChecklistItem[]
  isAdmin: boolean
  onChange: () => void
}) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [newItem, setNewItem] = useState('')
  const [error, setError] = useState('')

  async function run(p: PromiseLike<{ error: unknown }>) {
    setError('')
    const { error: err } = await p
    if (err) setError(mensajeError(err))
    onChange()
  }

  const update = (patch: Partial<Space>) => run(supabase.from('spaces').update(patch).eq('id', space.id))

  async function addItem(e: FormEvent) {
    e.preventDefault()
    const label = newItem.trim()
    if (!label) return
    setNewItem('')
    const order = Math.max(0, ...items.map((i) => i.sort_order)) + 1
    await run(supabase.from('space_checklist_items').insert({ household_id: space.household_id, space_id: space.id, label, sort_order: order }))
  }

  return (
    <article className="card stack">
      <button className="space-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="space-icon">{space.icon}</span>
        <span style={{ flex: 1, textAlign: 'left' }}>
          <span className="member-name">{space.name}</span>
          <span className="small muted" style={{ display: 'block' }}>
            {DIFICULTAD[space.difficulty]} · {space.minutes} min · {items.length} ítems
          </span>
        </span>
        <span className="dots" aria-label={`Dificultad ${space.difficulty} de 3`}>
          {[1, 2, 3].map((n) => (
            <span key={n} className={`dot${n <= space.difficulty ? ' on' : ''}`} />
          ))}
        </span>
        <span className="chev">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <ul className="checklist">
          {items.map((it) => (
            <li key={it.id}>
              {editing ? (
                <>
                  <input
                    className="input input-sm"
                    defaultValue={it.label}
                    maxLength={60}
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      if (v && v !== it.label) void run(supabase.from('space_checklist_items').update({ label: v }).eq('id', it.id))
                    }}
                  />
                  <button className="icon-btn" aria-label="Quitar ítem" onClick={() => run(supabase.from('space_checklist_items').update({ active: false }).eq('id', it.id))}>
                    ✕
                  </button>
                </>
              ) : (
                <>
                  <span className="check-box" aria-hidden />
                  {it.label}
                </>
              )}
            </li>
          ))}
          {editing && (
            <li>
              <form className="row" style={{ flex: 1 }} onSubmit={addItem}>
                <input className="input input-sm" placeholder="Nuevo ítem…" value={newItem} onChange={(e) => setNewItem(e.target.value)} maxLength={60} />
                <button className="btn btn-small">Agregar</button>
              </form>
            </li>
          )}
        </ul>
      )}

      {isAdmin && open && !editing && (
        <button className="btn btn-soft btn-small" onClick={() => setEditing(true)}>
          Editar espacio
        </button>
      )}
      {editing && (
        <div className="stack edit-zone">
          <div className="field">
            <label>Nombre</label>
            <input className="input" defaultValue={space.name} maxLength={40} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== space.name && update({ name: e.target.value.trim() })} />
          </div>
          <div className="emoji-grid" style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}>
            {ICONS.map((ic) => (
              <button key={ic} className={`emoji-btn${ic === space.icon ? ' on' : ''}`} onClick={() => update({ icon: ic })}>
                {ic}
              </button>
            ))}
          </div>
          <div className="field">
            <label>Dificultad</label>
            <div className="segmented">
              {[1, 2, 3].map((d) => (
                <button key={d} className={space.difficulty === d ? 'on' : ''} onClick={() => update({ difficulty: d })}>
                  {DIFICULTAD[d]}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Minutos estimados</label>
            <div className="stepper">
              <button className="btn btn-soft btn-small" onClick={() => space.minutes > 5 && update({ minutes: space.minutes - 5 })} aria-label="Menos minutos">−</button>
              <b>{space.minutes} min</b>
              <button className="btn btn-soft btn-small" onClick={() => space.minutes < 240 && update({ minutes: space.minutes + 5 })} aria-label="Más minutos">+</button>
            </div>
          </div>
          <p className="small muted">Peso: {space.difficulty} × {space.minutes} = {spaceWeight(space)}. Cambia los puntos de los turnos que lo incluyen.</p>
          <button className="btn btn-small" onClick={() => setEditing(false)}>
            Listo
          </button>
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}
    </article>
  )
}
