// Hoja para pedir un cambio de turno: elegir persona y qué ofrecer
import { useEffect, useState } from 'react'
import { isoWeekday, WEEKDAY_NAMES, type LocalDate } from '../../core/dates'
import type { WeekShift } from '../../hooks/useWeek'
import { mensajeError } from '../../lib/errors'
import { supabase, type Member } from '../../lib/supabase'
import { Avatar } from '../../ui/Avatar'

const fmtDay = (d: string) => new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`))
export const diaTurno = (d: LocalDate) => `${WEEKDAY_NAMES[isoWeekday(d)].toLowerCase()} ${fmtDay(d)}`

interface Props {
  shift: WeekShift
  householdId: string
  members: Member[]
  meId: string
  today: LocalDate
  onClose: () => void
}

export function PedirCambio({ shift, householdId, members, meId, today, onClose }: Props) {
  const [target, setTarget] = useState<string | null>(null)
  const [theirs, setTheirs] = useState<{ id: string; date: LocalDate }[]>([])
  const [offer, setOffer] = useState<string | 'cubrir' | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const people = members.filter((m) => m.participates && m.id !== meId)

  // Turnos pendientes de esa persona (de las semanas ya repartidas)
  useEffect(() => {
    setOffer(null)
    if (!target) return
    void supabase
      .from('shifts')
      .select('id, date')
      .eq('household_id', householdId)
      .eq('assigned_member_id', target)
      .eq('status', 'pending')
      .gte('date', today)
      .order('date')
      .then(({ data }) => setTheirs((data ?? []) as { id: string; date: LocalDate }[]))
  }, [target, householdId, today])

  const send = async () => {
    if (!shift.id || !target || !offer) return
    setBusy(true)
    setError('')
    const { error: e } = await supabase.rpc('request_swap', {
      p_shift: shift.id,
      p_target_member: target,
      p_target_shift: offer === 'cubrir' ? null : offer,
      p_note: note,
    })
    setBusy(false)
    if (e) return setError(mensajeError(e))
    setSent(true)
  }

  const who = members.find((m) => m.id === target)

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet stack" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Pedir cambio de turno">
        <div className="sheet-handle" />
        {sent ? (
          <div className="empty">
            <span className="big">📨</span>
            <h2>¡Solicitud enviada!</h2>
            <p className="muted">
              Primero debe aceptar {who?.profile.display_name} y después aprobarla un admin. Lo verás en Hoy.
            </p>
            <button className="btn btn-block" style={{ marginTop: 16 }} onClick={onClose}>Listo</button>
          </div>
        ) : (
          <>
            <h2 style={{ margin: 0 }}>🔄 Cambiar mi turno</h2>
            <p className="muted small">
              Tu turno del <b>{diaTurno(shift.date)}</b>: {shift.spaces.map((s) => s.name).join(', ')}
            </p>

            <p className="member-name">¿Con quién?</p>
            <div className="chips">
              {people.map((m) => (
                <button key={m.id} className={`chip chip-toggle${target === m.id ? ' on' : ''}`} onClick={() => setTarget(m.id)}>
                  <Avatar profile={m.profile} /> {m.profile.display_name}
                </button>
              ))}
            </div>

            {target && (
              <>
                <p className="member-name">¿Qué le ofreces?</p>
                <div className="stack" style={{ gap: 8 }}>
                  {theirs.map((t) => (
                    <button key={t.id} className={`option${offer === t.id ? ' on' : ''}`} onClick={() => setOffer(t.id)}>
                      🔁 Cambiar por su turno del <b>{diaTurno(t.date)}</b>
                    </button>
                  ))}
                  <button className={`option${offer === 'cubrir' ? ' on' : ''}`} onClick={() => setOffer('cubrir')}>
                    🤝 Que me cubra: le quedo debiendo un turno (se devuelve solo con la rotación)
                  </button>
                </div>
                <input className="input" placeholder="Motivo (opcional): ej. tengo prueba" maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} />
              </>
            )}

            {error && <div className="alert alert-error">{error}</div>}
            <div className="row">
              <button className="btn btn-soft" onClick={onClose}>Cancelar</button>
              <button className="btn" style={{ flex: 1 }} disabled={!target || !offer || busy} onClick={send}>
                {busy ? 'Enviando…' : 'Enviar solicitud'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
