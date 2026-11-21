// Dentro de mi turno: el turno anterior de la casa y el botón para poner
// una queja si quedó mal hecho. Si ya reclamé, muestra cómo va la queja.
import { useEffect, useRef, useState } from 'react'
import type { ShiftStatus } from '../../core/completion'
import type { LocalDate } from '../../core/dates'
import { complaintBlocker, complaintCounts, complaintOpen, complaintPenalty, previousShifts, QUEJA_MAX_FOTOS } from '../../core/quejas'
import type { Queja } from '../../hooks/useQuejas'
import { mensajeError } from '../../lib/errors'
import { addComplaintPhoto, removeComplaintPhoto, useShiftPhotos } from '../../lib/fotos'
import { supabase } from '../../lib/supabase'
import { useApp } from '../../state/AppState'
import { Avatar } from '../../ui/Avatar'
import { diaTurno } from '../cambios/PedirCambio'
import { BotonFotos } from '../fotos/FotosTurno'
import { NuevaQueja, type TurnoReclamable } from './NuevaQueja'

interface Anterior extends TurnoReclamable {
  status: ShiftStatus
  completedAt: string | null
}

export const estadoQueja = (q: Queja, accused: string): string =>
  ({
    vigente: `Esperando respuesta de ${accused}`,
    en_revision: 'En revisión por un admin',
    confirmada: q.decidedBy ? 'Un admin la mantuvo' : `${accused} la aceptó`,
    anulada: 'Anulada: se devolvieron los puntos',
    retirada: 'Retirada',
  })[q.status]

interface Props {
  myShiftDate: LocalDate
  windowOpen: boolean // mi turno está en plazo para reclamar
  quejas: Queja[]
  onChanged: () => Promise<void> | void
}

export function QuejaAnterior({ myShiftDate, windowOpen, quejas, onChanged }: Props) {
  const { household, members, me } = useApp()
  const [prev, setPrev] = useState<Anterior[]>([])
  const [abierta, setAbierta] = useState<Anterior | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const agregarA = useRef<Queja | null>(null) // queja a la que se agregan fotos
  const householdId = household?.id

  // El turno anterior puede ser de la semana pasada: se busca en el servidor
  useEffect(() => {
    if (!householdId) return
    void supabase
      .from('shifts')
      .select('id, date, assigned_member_id, status, points, snapshot, completed_at')
      .eq('household_id', householdId)
      .lt('date', myShiftDate)
      .order('date', { ascending: false })
      .limit(6)
      .then(({ data }) => {
        type Row = { id: string; date: string; assigned_member_id: string | null; status: ShiftStatus; points: number; snapshot: { spaces?: { name: string }[] }; completed_at: string | null }
        const rows = previousShifts((data ?? []) as Row[], myShiftDate)
        setPrev(rows.flatMap((r) => (r.assigned_member_id ? [{
          id: r.id, date: r.date, memberId: r.assigned_member_id, points: r.points, status: r.status, completedAt: r.completed_at,
          spaces: (r.snapshot.spaces ?? []).map((s) => s.name).join(', '),
        }] : [])))
      })
  }, [householdId, myShiftDate])

  const backup = useShiftPhotos(householdId, prev.map((p) => p.id))
  if (!household || !me) return null
  const name = (id: string) => members.find((m) => m.id === id)?.profile.display_name ?? 'alguien'

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError('')
    try {
      await fn()
      await onChanged()
    } catch (e) {
      setError(mensajeError(e))
    }
    setBusy(false)
  }

  const items = prev.flatMap((t): { t: Anterior; queja: Queja | undefined }[] => {
    const queja = quejas.find((q) => q.shiftId === t.id && q.status !== 'retirada')
    // Mi queja por este turno (aunque ya esté cerrada) o, si no hay, el botón para reclamar
    if (queja) return queja.complainantId === me.id ? [{ t, queja }] : []
    if (!windowOpen || complaintBlocker(t, me.id, new Date())) return []
    return [{ t, queja: undefined }]
  })
  if (!items.length) return null

  return (
    <div className="queja-prev stack">
      {items.map(({ t, queja }) => {
        const accused = members.find((m) => m.id === t.memberId)
        const fotosRespaldo = backup.photos[t.id] ?? []
        if (queja) {
          const editable = complaintOpen(queja.status) && Date.now() - new Date(queja.createdAt).getTime() < 24 * 3600_000
          return (
            <div key={t.id} className="stack" style={{ gap: 8 }}>
              <div className="row-between">
                <b className="small">📣 Reclamaste por el turno del {diaTurno(t.date)} de {name(t.memberId)}</b>
                {complaintCounts(queja.status) && <span className="queja-pts">−{queja.points} pts</span>}
              </div>
              <p className="small muted" style={{ margin: 0 }}>“{queja.reason}”</p>
              <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                <span className="badge badge-info">{estadoQueja(queja, name(t.memberId))}</span>
                <BotonFotos photos={queja.photos} title={`Queja: ${queja.reason}`} remove={removeComplaintPhoto} />
              </div>
              {queja.response && <p className="small" style={{ margin: 0 }}>💬 {name(t.memberId)}: “{queja.response}”</p>}
              {editable && (
                <div className="row">
                  {queja.photos.length < QUEJA_MAX_FOTOS && (
                    <button className="btn btn-small btn-queja" style={{ flex: 1 }} disabled={busy} onClick={() => {
                      agregarA.current = queja
                      input.current?.click()
                    }}>
                      {busy ? 'Subiendo…' : '＋ Agregar foto'}
                    </button>
                  )}
                  <button className="btn btn-ghost btn-small" disabled={busy} onClick={() => void run(async () => {
                    const { error: e } = await supabase.rpc('withdraw_complaint', { p_id: queja.id })
                    if (e) throw e
                  })}>
                    Retirar queja
                  </button>
                </div>
              )}
            </div>
          )
        }
        return (
          <div key={t.id} className="stack" style={{ gap: 8 }}>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              {accused && <Avatar profile={accused.profile} />}
              <div className="stack" style={{ gap: 6, alignItems: 'flex-start' }}>
                <b className="small">
                  Turno anterior: {diaTurno(t.date)}, {name(t.memberId)}
                </b>
                <p className="small muted" style={{ margin: 0 }}>
                  ¿Lo encontraste mal hecho? Reclama con fotos y se le restan {complaintPenalty(t.points)} pts.
                </p>
                {fotosRespaldo.length > 0 && <BotonFotos photos={fotosRespaldo} title={`Fotos de respaldo de ${name(t.memberId)}`} label="de respaldo" />}
              </div>
            </div>
            <button className="btn btn-small btn-queja btn-block" onClick={() => setAbierta(t)}>
              📣 Poner una queja
            </button>
          </div>
        )
      })}
      {error && <div className="alert alert-error small">{error}</div>}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const q = agregarA.current
          const files = Array.from(e.target.files ?? []).slice(0, q ? QUEJA_MAX_FOTOS - q.photos.length : 0)
          e.target.value = ''
          if (q && files.length) void run(async () => {
            for (const f of files) await addComplaintPhoto(household.id, q.id, f)
          })
        }}
      />
      {abierta && (
        <NuevaQueja
          householdId={household.id}
          target={abierta}
          accused={members.find((m) => m.id === abierta.memberId)}
          backupPhotos={backup.photos[abierta.id] ?? []}
          onClose={() => setAbierta(null)}
          onSent={() => void onChanged()}
        />
      )}
    </div>
  )
}
