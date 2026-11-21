// Hoja para poner una queja por el turno anterior: fotos de cómo quedó
// (1 a 6) y qué quedó mal. Al enviarla se restan puntos al instante.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { complaintPenalty, QUEJA_MAX_FOTOS } from '../../core/quejas'
import type { LocalDate } from '../../core/dates'
import { mensajeError } from '../../lib/errors'
import { fileComplaint, type ShiftPhoto } from '../../lib/fotos'
import type { Member } from '../../lib/supabase'
import { Avatar } from '../../ui/Avatar'
import { diaTurno } from '../cambios/PedirCambio'
import { BotonFotos } from '../fotos/FotosTurno'

export interface TurnoReclamable {
  id: string
  date: LocalDate
  memberId: string
  points: number
  spaces: string
}

interface Props {
  householdId: string
  target: TurnoReclamable
  accused: Member | undefined
  backupPhotos: ShiftPhoto[] // fotos de respaldo que dejó quien hizo el turno
  onClose: () => void
  onSent: () => void
}

interface Elegida {
  file: File
  url: string
}

export function NuevaQueja({ householdId, target, accused, backupPhotos, onClose, onSent }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [fotos, setFotos] = useState<Elegida[]>([])
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [subidas, setSubidas] = useState(0)
  const [error, setError] = useState('')
  const [sent, setSent] = useState<number | null>(null)
  const name = accused?.profile.display_name ?? 'quien hizo el turno'
  const penalty = complaintPenalty(target.points)

  // Libera las vistas previas al cerrar
  const fotosRef = useRef(fotos)
  fotosRef.current = fotos
  useEffect(() => () => fotosRef.current.forEach((f) => URL.revokeObjectURL(f.url)), [])

  const elegir = (files: FileList | null) => {
    const libres = QUEJA_MAX_FOTOS - fotos.length
    const nuevas = Array.from(files ?? []).slice(0, Math.max(libres, 0)).map((file) => ({ file, url: URL.createObjectURL(file) }))
    if (input.current) input.current.value = ''
    setFotos((f) => [...f, ...nuevas])
  }

  const quitar = (i: number) => {
    URL.revokeObjectURL(fotos[i].url)
    setFotos((f) => f.filter((_, j) => j !== i))
  }

  const send = async () => {
    setBusy(true)
    setError('')
    setSubidas(0)
    try {
      const res = await fileComplaint(householdId, target.id, reason.trim(), fotos.map((f) => f.file), setSubidas)
      setSent(res.points)
      onSent()
    } catch (e) {
      setError(mensajeError(e))
    }
    setBusy(false)
  }

  const listo = fotos.length > 0 && reason.trim().length >= 3

  // En un portal: dentro de la tarjeta del turno (que tiene animación) el fondo no taparía toda la pantalla
  return createPortal(
    <div className="sheet-backdrop" onClick={busy ? undefined : onClose}>
      <div className="sheet stack" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Poner una queja">
        <div className="sheet-handle" />
        {sent !== null ? (
          <div className="empty">
            <span className="big">📣</span>
            <h2>Queja enviada</h2>
            <p className="muted">
              Se restaron {sent} pts a {name}. Puede aceptarla o pedir que un admin la revise; lo verás en Hoy.
            </p>
            <button className="btn btn-block" style={{ marginTop: 16 }} onClick={onClose}>Listo</button>
          </div>
        ) : (
          <>
            <h2 style={{ margin: 0 }}>📣 Queja por la limpieza anterior</h2>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              {accused && <Avatar profile={accused.profile} />}
              <div className="stack" style={{ gap: 4 }}>
                <p className="small" style={{ margin: 0 }}>
                  Turno del <b>{diaTurno(target.date)}</b> de <b>{name}</b>: {target.spaces}
                </p>
                {backupPhotos.length > 0 && (
                  <div className="row small muted" style={{ gap: 6 }}>
                    Así dijo que lo dejó: <BotonFotos photos={backupPhotos} title={`Fotos de respaldo de ${name}`} />
                  </div>
                )}
              </div>
            </div>

            <div className="row-between">
              <b className="small">📷 Fotos de cómo lo encontraste</b>
              <span className="small muted">
                {fotos.length} de {QUEJA_MAX_FOTOS}
              </span>
            </div>
            <div className="fotos-grid">
              {fotos.map((f, i) => (
                <div key={f.url} className="foto-mini foto-elegida">
                  <img src={f.url} alt={`Foto ${i + 1}`} />
                  {!busy && (
                    <button className="foto-quitar" onClick={() => quitar(i)} aria-label={`Quitar foto ${i + 1}`}>
                      ✕
                    </button>
                  )}
                  {busy && i >= subidas && <span className="foto-cargando"><span className="spinner" /></span>}
                </div>
              ))}
              {fotos.length < QUEJA_MAX_FOTOS && !busy && (
                <button className="foto-mini foto-add" onClick={() => input.current?.click()}>
                  <span aria-hidden>＋</span>
                  <span className="small">Agregar</span>
                </button>
              )}
            </div>
            <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => elegir(e.target.files)} />

            <label className="field">
              <b className="small">¿Qué quedó mal?</b>
              <textarea
                className="input"
                rows={3}
                maxLength={200}
                placeholder="Ej: el baño quedó con pelos en la ducha y el espejo manchado"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={busy}
              />
            </label>

            <div className="alert alert-info small">
              A {name} se le restan <b>{penalty} pts</b> (la mitad del turno). Puede aceptar la queja o pedir que un admin la revise.
            </div>

            {error && <div className="alert alert-error">{error}</div>}
            <div className="row">
              <button className="btn btn-soft" onClick={onClose} disabled={busy}>Cancelar</button>
              <button className="btn" style={{ flex: 1 }} disabled={!listo || busy} onClick={() => void send()}>
                {busy ? (subidas < fotos.length ? `Subiendo fotos ${subidas + 1} de ${fotos.length}…` : 'Enviando…') : !fotos.length ? 'Falta al menos una foto' : 'Enviar queja'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
