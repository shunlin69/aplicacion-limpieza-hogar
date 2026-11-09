// Un turno de la semana (ej: Miércoles = living + comedor + cocina).
// Los admins pueden cambiar los días y los espacios que incluye.
import { useState } from 'react'
import { WEEKDAY_NAMES, type IsoWeekday } from '../../core/dates'
import { shiftMinutes, shiftPoints } from '../../core/effort'
import { describeRecurrence } from '../../core/recurrence'
import { templateRule, type ShiftTemplate, type Space } from '../../hooks/useCatalog'
import { mensajeError } from '../../lib/errors'
import { supabase } from '../../lib/supabase'

const DAYS: IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7]

export function TurnoCard({ template, spaces, householdId, isAdmin, onChange }: {
  template: ShiftTemplate
  spaces: Space[]
  householdId: string
  isAdmin: boolean
  onChange: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const included = spaces.filter((s) => template.spaceIds.includes(s.id))

  async function run(p: PromiseLike<{ error: unknown }>) {
    setError('')
    const { error: err } = await p
    if (err) setError(mensajeError(err))
    onChange()
  }

  const toggleDay = (d: IsoWeekday) => {
    const next = template.weekdays.includes(d) ? template.weekdays.filter((x) => x !== d) : [...template.weekdays, d].sort()
    if (next.length === 0) return setError('El turno necesita al menos un día')
    void run(supabase.from('shift_templates').update({ weekdays: next }).eq('id', template.id))
  }

  const toggleSpace = (s: Space) => {
    if (template.spaceIds.includes(s.id)) {
      if (template.spaceIds.length === 1) return setError('El turno necesita al menos un espacio')
      void run(supabase.from('shift_template_spaces').delete().eq('shift_template_id', template.id).eq('space_id', s.id))
    } else {
      void run(supabase.from('shift_template_spaces').insert({ household_id: householdId, shift_template_id: template.id, space_id: s.id }))
    }
  }

  return (
    <article className="card stack">
      <div className="row-between">
        <div>
          <h2 style={{ marginBottom: 2 }}>{template.name}</h2>
          {/* Solo muestra los días si no son obvios por el nombre (ej: turno "Lunes" los lunes) */}
          {describeRecurrence(templateRule(template), WEEKDAY_NAMES) !== template.name && (
            <p className="small muted">{describeRecurrence(templateRule(template), WEEKDAY_NAMES)}</p>
          )}
        </div>
        <div className="points-pill">{shiftPoints(included)} pts</div>
      </div>

      <div className="chips">
        {included.map((s) => (
          <span key={s.id} className="chip">
            {s.icon} {s.name}
          </span>
        ))}
      </div>
      <p className="small muted">≈ {shiftMinutes(included)} minutos en total</p>

      {isAdmin && !editing && (
        <button className="btn btn-soft btn-small" onClick={() => setEditing(true)}>
          Editar turno
        </button>
      )}
      {editing && (
        <div className="stack edit-zone">
          <label className="small muted">Días</label>
          <div className="day-toggles">
            {DAYS.map((d) => (
              <button key={d} className={`day-toggle${template.weekdays.includes(d) ? ' on' : ''}`} onClick={() => toggleDay(d)} aria-label={WEEKDAY_NAMES[d]}>
                {WEEKDAY_NAMES[d].slice(0, 2)}
              </button>
            ))}
          </div>
          <label className="small muted">Espacios que incluye</label>
          <div className="chips">
            {spaces.map((s) => (
              <button key={s.id} className={`chip chip-toggle${template.spaceIds.includes(s.id) ? ' on' : ''}`} onClick={() => toggleSpace(s)}>
                {s.icon} {s.name}
              </button>
            ))}
          </div>
          <button className="btn btn-small" onClick={() => setEditing(false)}>
            Listo
          </button>
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}
    </article>
  )
}
