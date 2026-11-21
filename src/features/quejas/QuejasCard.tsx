// Quejas que necesitan algo de ti: aceptarla o pedir revisión (si es sobre
// tu turno), decidir la revisión (si eres admin) o retirarla (si la pusiste).
import { useState } from 'react'
import { canRespond, complaintOpen, QUEJA_DIAS_RESPUESTA } from '../../core/quejas'
import type { Queja } from '../../hooks/useQuejas'
import { mensajeError } from '../../lib/errors'
import { removeComplaintPhoto, useShiftPhotos } from '../../lib/fotos'
import { supabase, type Member } from '../../lib/supabase'
import { Avatar } from '../../ui/Avatar'
import { diaTurno } from '../cambios/PedirCambio'
import { BotonFotos } from '../fotos/FotosTurno'

interface Props {
  quejas: Queja[]
  members: Member[]
  me: Member
  hideShiftIds: string[] // mis turnos que ya muestran su queja en la tarjeta del turno
  onChanged: () => Promise<void> | void
}

export function QuejasCard({ quejas, members, me, hideShiftIds, onChanged }: Props) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [respondiendo, setRespondiendo] = useState<string | null>(null) // queja en la que escribo mi versión
  const [texto, setTexto] = useState('')
  const now = new Date()
  const name = (id: string) => members.find((m) => m.id === id)?.profile.display_name ?? 'alguien'
  const isAdmin = me.role === 'admin'

  const open = quejas.filter((q) => complaintOpen(q.status))
  // Sobre mi turno: para responder (3 días) o esperando al admin
  const forMe = open.filter((q) => q.accusedId === me.id && (q.status === 'en_revision' || canRespond(q.status, q.createdAt, now)))
  // Admins: las que están en revisión y las recién puestas (por si hay que anular alguna)
  const forAdmin = isAdmin ? open.filter((q) => !forMe.includes(q) && (q.status === 'en_revision' || canRespond(q.status, q.createdAt, now))) : []
  // Las que puse yo y siguen abiertas (si no aparecen ya en mi turno)
  const mine = open.filter((q) => q.complainantId === me.id && !forAdmin.includes(q) && !hideShiftIds.includes(q.complainantShiftId ?? '')
    && (q.status === 'en_revision' || canRespond(q.status, q.createdAt, now)))
  const respaldo = useShiftPhotos(me.household_id, [...forMe, ...forAdmin].map((q) => q.shiftId))
  if (!forMe.length && !forAdmin.length && !mine.length) return null

  const run = async (id: string, fn: string, args: Record<string, unknown>) => {
    setBusy(id)
    setError('')
    const { error: e } = await supabase.rpc(fn, args)
    setBusy(null)
    if (e) return setError(mensajeError(e))
    setRespondiendo(null)
    setTexto('')
    await onChanged()
  }

  const person = (id: string) => {
    const m = members.find((x) => x.id === id)
    return m ? <Avatar profile={m.profile} /> : null
  }

  const fotos = (q: Queja) => (
    <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
      <BotonFotos photos={q.photos} title={`Queja de ${name(q.complainantId)}: ${q.reason}`} label="de la queja" remove={removeComplaintPhoto} />
      <BotonFotos photos={respaldo.photos[q.shiftId] ?? []} title={`Fotos de respaldo de ${name(q.accusedId)}`} label="de respaldo" />
    </div>
  )

  const otherAdmins = (q: Queja) =>
    members.some((m) => m.role === 'admin' && m.id !== me.id && m.id !== q.complainantId && m.id !== q.accusedId)

  return (
    <div className="card stack swap-card queja-card">
      <h2 style={{ marginBottom: 0 }}>📣 Quejas</h2>

      {forMe.map((q) => (
        <div key={q.id} className="swap-item">
          <div className="row" style={{ alignItems: 'flex-start' }}>
            {person(q.complainantId)}
            <div>
              <p style={{ margin: 0 }}>
                <b>{name(q.complainantId)}</b> reclamó por tu turno del <b>{diaTurno(q.shiftDate)}</b>: “{q.reason}”
              </p>
              <p className="small muted" style={{ margin: 0 }}>Se restaron {q.points} pts.</p>
            </div>
          </div>
          {fotos(q)}
          {q.status === 'en_revision' ? (
            <>
              {q.response && <p className="small" style={{ margin: 0 }}>💬 Tu versión: “{q.response}”</p>}
              <span className="badge badge-info" style={{ alignSelf: 'flex-start' }}>Esperando a un admin</span>
            </>
          ) : respondiendo === q.id ? (
            <div className="stack" style={{ gap: 8 }}>
              <textarea
                className="input"
                rows={2}
                maxLength={200}
                placeholder="Tu versión: ej. lo dejé limpio, las fotos de respaldo lo muestran"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
              />
              <div className="row">
                <button className="btn btn-soft btn-small" onClick={() => setRespondiendo(null)}>Volver</button>
                <button className="btn btn-small" style={{ flex: 1 }} disabled={busy === q.id || texto.trim().length < 3} onClick={() => void run(q.id, 'respond_complaint', { p_id: q.id, p_accept: false, p_response: texto })}>
                  Pedir revisión a un admin
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="row">
                <button className="btn btn-soft btn-small" style={{ flex: 1 }} disabled={busy === q.id} onClick={() => { setRespondiendo(q.id); setTexto('') }}>
                  Pedir revisión
                </button>
                <button className="btn btn-small" style={{ flex: 1 }} disabled={busy === q.id} onClick={() => void run(q.id, 'respond_complaint', { p_id: q.id, p_accept: true })}>
                  Tiene razón
                </button>
              </div>
              <p className="small muted" style={{ margin: 0 }}>Tienes {QUEJA_DIAS_RESPUESTA} días para responder. Si no, la queja queda tal cual.</p>
            </>
          )}
        </div>
      ))}

      {forAdmin.map((q) => {
        const party = q.complainantId === me.id || q.accusedId === me.id
        return (
          <div key={q.id} className="swap-item">
            <p className="small muted" style={{ margin: 0 }}>
              {q.status === 'en_revision' ? `${name(q.accusedId)} pidió revisión · falta que un admin decida` : `Esperando respuesta de ${name(q.accusedId)}`}
            </p>
            <p style={{ margin: 0 }}>
              <b>{name(q.complainantId)}</b> reclamó por el turno del <b>{diaTurno(q.shiftDate)}</b> de <b>{name(q.accusedId)}</b> (−{q.points} pts): “{q.reason}”
            </p>
            {q.response && <p className="small" style={{ margin: 0 }}>💬 {name(q.accusedId)}: “{q.response}”</p>}
            {fotos(q)}
            {party && otherAdmins(q) ? (
              <p className="small muted" style={{ margin: 0 }}>Eres parte de esta queja: la decide otro admin.</p>
            ) : q.status === 'en_revision' ? (
              <div className="row">
                <button className="btn btn-soft btn-small" style={{ flex: 1 }} disabled={busy === q.id} onClick={() => void run(q.id, 'decide_complaint', { p_id: q.id, p_keep: false })}>
                  Anular y devolver {q.points} pts
                </button>
                <button className="btn btn-small" style={{ flex: 1 }} disabled={busy === q.id} onClick={() => void run(q.id, 'decide_complaint', { p_id: q.id, p_keep: true })}>
                  Mantener
                </button>
              </div>
            ) : (
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost btn-small" disabled={busy === q.id} onClick={() => void run(q.id, 'decide_complaint', { p_id: q.id, p_keep: false })}>
                  Anular queja
                </button>
              </div>
            )}
          </div>
        )
      })}

      {mine.map((q) => (
        <div key={q.id} className="swap-item">
          <p style={{ margin: 0 }}>
            Tu queja por el turno del <b>{diaTurno(q.shiftDate)}</b> de <b>{name(q.accusedId)}</b>: “{q.reason}”
          </p>
          {q.response && <p className="small" style={{ margin: 0 }}>💬 {name(q.accusedId)}: “{q.response}”</p>}
          <div className="row-between">
            <span className="badge badge-info">{q.status === 'en_revision' ? 'En revisión por un admin' : `Esperando respuesta de ${name(q.accusedId)}`}</span>
            <button className="btn btn-ghost btn-small" disabled={busy === q.id} onClick={() => void run(q.id, 'withdraw_complaint', { p_id: q.id })}>
              Retirar
            </button>
          </div>
        </div>
      ))}

      {error && <div className="alert alert-error">{error}</div>}
    </div>
  )
}
