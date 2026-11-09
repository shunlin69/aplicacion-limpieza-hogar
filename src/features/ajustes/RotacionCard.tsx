// Rotación: orden sorteado (visible para todos) y, para admins, el sorteo
// y las semanas no disponibles (exámenes, viajes).
import { useState } from 'react'
import { addDays, localDateOf, weekStart } from '../../core/dates'
import { mensajeError } from '../../lib/errors'
import { drawRotation, regenerateWeek } from '../../lib/schedule'
import { supabase } from '../../lib/supabase'
import { useApp } from '../../state/AppState'
import { useWeek } from '../../hooks/useWeek'
import { Avatar } from '../../ui/Avatar'

const fmt = (d: string) => new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`))

export function RotacionCard() {
  const { household, members, isAdmin, refresh } = useApp()
  const today = localDateOf(new Date(), household?.timezone ?? 'America/Santiago')
  const thisMonday = weekStart(today)
  const mondays = [1, 2, 3, 4].map((i) => addDays(thisMonday, 7 * i))
  const [start, setStart] = useState(household?.rotation_start ?? mondays[0])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const started = !!household?.rotation_start && household.rotation_start <= today
  const ordered = members.filter((m) => m.participates).sort((a, b) => (a.rotation_order ?? 99) - (b.rotation_order ?? 99))

  async function draw() {
    if (household?.rotation_start && !confirm('¿Volver a sortear? El orden actual se reemplaza.')) return
    setBusy(true)
    setMsg(null)
    try {
      await drawRotation(household!.id, start)
      await refresh()
      setMsg({ ok: true, text: '¡Sorteo listo! Todos ven el resultado en Semana.' })
    } catch (e) {
      setMsg({ ok: false, text: mensajeError(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card stack">
      <h2>🎲 Rotación</h2>
      {household?.rotation_start ? (
        <>
          <p className="small muted">Parte el lunes {fmt(household.rotation_start)}. Orden sorteado:</p>
          <ol className="order-list">
            {ordered.map((m) => (
              <li key={m.id} className="row">
                <Avatar profile={m.profile} /> <b>{m.profile.display_name}</b>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="small muted">Todavía no hay sorteo. Cuando un admin lo haga, la app reparte los turnos automáticamente cada semana.</p>
      )}

      {isAdmin && !started && (
        <div className="stack edit-zone">
          <p className="small">
            Participan {ordered.length} {ordered.length === 1 ? 'persona' : 'personas'}. Asegúrate de que todos se hayan unido antes de sortear; quien llegue después entra al final de la rotación.
          </p>
          <div className="field">
            <label>Lunes de inicio</label>
            <div className="segmented">
              {mondays.map((d) => (
                <button key={d} className={start === d ? 'on' : ''} onClick={() => setStart(d)}>
                  {fmt(d).replace(' de ', ' ')}
                </button>
              ))}
            </div>
          </div>
          <button className="btn btn-block" disabled={busy || ordered.length === 0} onClick={draw}>
            {busy ? 'Sorteando…' : household?.rotation_start ? 'Volver a sortear' : 'Sortear orden 🎲'}
          </button>
        </div>
      )}
      {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-error'}`}>{msg.text}</div>}
      {isAdmin && household?.rotation_start && <AusenciasZone thisMonday={thisMonday} />}
    </section>
  )
}

function AusenciasZone({ thisMonday }: { thisMonday: string }) {
  const { household, members } = useApp()
  const participants = members.filter((m) => m.participates)
  const weeks = [0, 1, 2, 3].map((i) => addDays(thisMonday, 7 * i))
  const [memberId, setMemberId] = useState(participants[0]?.id ?? '')
  const [week, setWeek] = useState(weeks[0])
  const [reason, setReason] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const { absences } = useWeek(household, members, thisMonday)
  const upcoming = absences.filter((a) => a.weekStart >= thisMonday).sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1))

  async function mark() {
    setMsg(null)
    const { error } = await supabase.from('member_unavailability').insert({ household_id: household!.id, member_id: memberId, week_start: week, reason: reason.trim() || null })
    if (error) return setMsg({ ok: false, text: /duplicate/i.test(error.message) ? 'Ya estaba marcada esa semana' : mensajeError(error) })
    try {
      await regenerateWeek(household!.id, week)
      setReason('')
      setMsg({ ok: true, text: 'Marcado. Quien descansa esa semana cubre el turno y queda registrado.' })
    } catch (e) {
      setMsg({ ok: false, text: mensajeError(e) })
    }
  }

  async function remove(id: string, w: string) {
    await supabase.from('member_unavailability').delete().eq('id', id)
    await regenerateWeek(household!.id, w).catch(() => undefined)
  }

  const name = (id: string) => members.find((m) => m.id === id)?.profile.display_name ?? ''
  const label = (w: string) => (w === weeks[0] ? 'Esta' : w === weeks[1] ? 'Próxima' : fmt(w).replace(' de ', ' '))

  return (
    <div className="stack edit-zone">
      <b>📚 Semana no disponible</b>
      <p className="small muted">Exámenes, viajes, enfermedad. Lo cubre quien descansa y la persona devuelve el turno más adelante.</p>
      <select className="input" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
        {participants.map((m) => (
          <option key={m.id} value={m.id}>
            {m.profile.display_name}
          </option>
        ))}
      </select>
      <div className="segmented">
        {weeks.map((w) => (
          <button key={w} className={week === w ? 'on' : ''} onClick={() => setWeek(w)}>
            {label(w)}
          </button>
        ))}
      </div>
      <input className="input" placeholder="Motivo (opcional), ej: exámenes" value={reason} maxLength={80} onChange={(e) => setReason(e.target.value)} />
      <button className="btn btn-soft btn-block" disabled={!memberId} onClick={mark}>
        Marcar no disponible
      </button>
      {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-error'}`}>{msg.text}</div>}
      {upcoming.map((a) => (
        <div key={a.id} className="row-between">
          <span>
            <b>{name(a.memberId)}</b> · semana del {fmt(a.weekStart)}
            {a.reason ? ` · ${a.reason}` : ''}
          </span>
          <button className="icon-btn" aria-label="Quitar" onClick={() => remove(a.id, a.weekStart)}>
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
