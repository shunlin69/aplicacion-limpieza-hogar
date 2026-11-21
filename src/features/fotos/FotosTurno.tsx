// Fotos de respaldo dentro de un turno: miniaturas, botón para agregar
// (cámara o galería) y visor. Quien hace el turno puede agregar hasta 4.
import { useEffect, useRef, useState } from 'react'
import { MAX_FOTOS, removeShiftPhoto, signedUrls, uploadShiftPhoto, type ShiftPhoto } from '../../lib/fotos'
import { mensajeError } from '../../lib/errors'
import { useApp } from '../../state/AppState'
import { VisorFotos } from './VisorFotos'

interface Props {
  shiftId: string
  photos: ShiftPhoto[]
  canEdit: boolean // es mi turno y aún puedo agregar o quitar
  required?: boolean // el hogar exige foto para terminar
  onChanged: () => Promise<void> | void
}

export function FotosTurno({ shiftId, photos, canEdit, required, onChanged }: Props) {
  const { household, members, me, isAdmin } = useApp()
  const input = useRef<HTMLInputElement>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [subiendo, setSubiendo] = useState(0)
  const [error, setError] = useState('')
  const [visor, setVisor] = useState<number | null>(null)

  useEffect(() => {
    if (photos.length) void signedUrls(photos.map((p) => p.path)).then(setUrls)
  }, [photos])

  if (!household) return null
  const libres = MAX_FOTOS - photos.length - subiendo

  const elegir = async (files: FileList | null) => {
    const list = Array.from(files ?? []).slice(0, Math.max(libres, 0))
    if (input.current) input.current.value = ''
    if (!list.length) return
    setError('')
    setSubiendo(list.length)
    for (const f of list) {
      try {
        await uploadShiftPhoto(household.id, shiftId, f)
      } catch (e) {
        setError(mensajeError(e))
      }
      setSubiendo((n) => n - 1)
    }
    await onChanged()
  }

  const quitar = async (p: ShiftPhoto) => {
    setError('')
    try {
      await removeShiftPhoto(p.id)
      setVisor(null)
      await onChanged()
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  if (!canEdit && !photos.length) return null

  return (
    <div className="fotos stack">
      <div className="row-between">
        <b className="small">📷 Fotos de respaldo{required ? '' : ' (opcional)'}</b>
        <span className="small muted">
          {photos.length} de {MAX_FOTOS}
        </span>
      </div>
      <div className="fotos-grid">
        {photos.map((p, i) => (
          <button key={p.id} className="foto-mini" onClick={() => setVisor(i)} aria-label={`Ver foto ${i + 1}`}>
            {urls[p.path] ? <img src={urls[p.path]} alt="" loading="lazy" /> : <span className="spinner" />}
          </button>
        ))}
        {Array.from({ length: subiendo }, (_, i) => (
          <div key={`s${i}`} className="foto-mini foto-subiendo">
            <span className="spinner" />
          </div>
        ))}
        {canEdit && libres > 0 && (
          <button className="foto-mini foto-add" onClick={() => input.current?.click()}>
            <span aria-hidden>＋</span>
            <span className="small">Agregar</span>
          </button>
        )}
      </div>
      {canEdit && photos.length === 0 && !subiendo && (
        <p className="small muted" style={{ margin: 0 }}>
          {required ? 'Este hogar pide al menos una foto para terminar el turno.' : 'Saca una foto de cómo quedó, así queda el respaldo.'}
        </p>
      )}
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => void elegir(e.target.files)} />
      {error && <div className="alert alert-error small">{error}</div>}
      {visor !== null && (
        <VisorFotos
          photos={photos}
          start={visor}
          members={members}
          timeZone={household.timezone}
          onClose={() => setVisor(null)}
          onRemove={(p) => void quitar(p)}
          canRemove={(p) => (canEdit && p.uploadedBy === me?.user_id) || isAdmin}
        />
      )}
    </div>
  )
}

/**
 * Botón chico "📷 2" que abre el visor (para Semana, Historial y quejas).
 * Un admin puede quitar fotos desde el visor; `remove` dice cómo (fotos de turno por defecto).
 */
export function BotonFotos({ photos, title, label, remove = removeShiftPhoto }: { photos: ShiftPhoto[]; title?: string; label?: string; remove?: (id: string) => Promise<void> }) {
  const { household, members, isAdmin } = useApp()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  if (!photos.length || !household) return null
  return (
    <>
      <button className="badge foto-chip" onClick={() => setOpen(true)} aria-label={`Ver ${photos.length} fotos${label ? ` ${label}` : ''}`}>
        📷 {photos.length}{label ? ` ${label}` : ''}
      </button>
      {error && <span className="small status-missed">{error}</span>}
      {open && (
        <VisorFotos
          photos={photos}
          members={members}
          timeZone={household.timezone}
          title={title}
          onClose={() => setOpen(false)}
          onRemove={
            isAdmin
              ? (p) =>
                  void remove(p.id).catch((e) => {
                    setError(mensajeError(e))
                  })
              : undefined
          }
        />
      )}
    </>
  )
}
