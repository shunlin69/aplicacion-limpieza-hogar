// Solicitudes de cambio que necesitan algo de ti: aceptar (si son para ti),
// aprobar (si eres admin) o seguir/cancelar las que pediste.
import { useState } from 'react'
import { isOpen, type Swap } from '../../hooks/useSwaps'
import { mensajeError } from '../../lib/errors'
import { supabase, type Member } from '../../lib/supabase'
import { Avatar } from '../../ui/Avatar'
import { diaTurno } from './PedirCambio'

interface Props {
  swaps: Swap[]
  members: Member[]
  me: Member
  onChanged: () => void
}

export function SolicitudesCard({ swaps, members, me, onChanged }: Props) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const name = (id: string) => members.find((m) => m.id === id)?.profile.display_name ?? 'alguien'
  const isAdmin = me.role === 'admin'
  const otherAdmins = members.filter((m) => m.role === 'admin' && m.id !== me.id).length > 0

  const open = swaps.filter(isOpen)
  const forMe = open.filter((s) => s.status === 'pending_target' && s.targetId === me.id)
  const toApprove = isAdmin ? open.filter((s) => s.status === 'pending_admin') : []
  const mine = open.filter((s) => s.requesterId === me.id)
  if (!forMe.length && !toApprove.length && !mine.length) return null

  const run = async (id: string, fn: string, args: Record<string, unknown>) => {
    setBusy(id)
    setError('')
    setInfo('')
    const { data, error: e } = await supabase.rpc(fn, args)
    setBusy(null)
    if (e) return setError(mensajeError(e))
    if (data === 'expired') setInfo('Ese cambio ya no se puede hacer: algún turno cambió o ya pasó.')
    onChanged()
  }

  const describe = (s: Swap) =>
    s.targetShiftId && s.targetShiftDate ? (
      <>
        <b>{name(s.requesterId)}</b> ({diaTurno(s.shiftDate)}) ⇄ <b>{name(s.targetId)}</b> ({diaTurno(s.targetShiftDate)})
      </>
    ) : (
      <>
        <b>{name(s.targetId)}</b> cubre a <b>{name(s.requesterId)}</b> el {diaTurno(s.shiftDate)} (le queda debiendo uno)
      </>
    )

  const person = (id: string) => {
    const m = members.find((x) => x.id === id)
    return m ? <Avatar profile={m.profile} /> : null
  }

  return (
    <div className="card stack swap-card">
      <h2 style={{ marginBottom: 0 }}>🔄 Cambios de turno</h2>

      {forMe.map((s) => (
        <div key={s.id} className="swap-item">
          <div className="row" style={{ alignItems: 'flex-start' }}>
            {person(s.requesterId)}
            <div>
              <p>
                <b>{name(s.requesterId)}</b>{' '}
                {s.targetShiftDate
                  ? <>te pide cambiar su turno del <b>{diaTurno(s.shiftDate)}</b> por tu turno del <b>{diaTurno(s.targetShiftDate)}</b>.</>
                  : <>te pide que lo cubras el <b>{diaTurno(s.shiftDate)}</b>. Te quedaría debiendo un turno.</>}
              </p>
              {s.note && <p className="small muted">“{s.note}”</p>}
            </div>
          </div>
          <div className="row">
            <button className="btn btn-soft btn-small" style={{ flex: 1 }} disabled={busy === s.id} onClick={() => run(s.id, 'respond_swap', { p_id: s.id, p_accept: false })}>No puedo</button>
            <button className="btn btn-small" style={{ flex: 1 }} disabled={busy === s.id} onClick={() => run(s.id, 'respond_swap', { p_id: s.id, p_accept: true })}>Acepto</button>
          </div>
        </div>
      ))}

      {toApprove.map((s) => {
        const party = s.requesterId === me.id || s.targetId === me.id
        return (
          <div key={s.id} className="swap-item">
            <p className="small muted">Aceptado por ambos · falta aprobación de un admin</p>
            <p>{describe(s)}</p>
            {s.note && <p className="small muted">“{s.note}”</p>}
            {party && otherAdmins ? (
              <p className="small muted">Eres parte de este cambio: lo aprueba otro admin.</p>
            ) : (
              <div className="row">
                <button className="btn btn-soft btn-small" style={{ flex: 1 }} disabled={busy === s.id} onClick={() => run(s.id, 'decide_swap', { p_id: s.id, p_approve: false })}>Rechazar</button>
                <button className="btn btn-small" style={{ flex: 1 }} disabled={busy === s.id} onClick={() => run(s.id, 'decide_swap', { p_id: s.id, p_approve: true })}>Aprobar</button>
              </div>
            )}
          </div>
        )
      })}

      {mine.filter((s) => !toApprove.includes(s)).map((s) => (
        <div key={s.id} className="swap-item">
          <p>{describe(s)}</p>
          <div className="row-between">
            <span className="badge badge-info">{s.status === 'pending_target' ? `Esperando a ${name(s.targetId)}` : 'Esperando a un admin'}</span>
            <button className="btn btn-ghost btn-small" disabled={busy === s.id} onClick={() => run(s.id, 'cancel_swap', { p_id: s.id })}>Cancelar</button>
          </div>
        </div>
      ))}

      {info && <div className="alert alert-info small">{info}</div>}
      {error && <div className="alert alert-error">{error}</div>}
    </div>
  )
}
