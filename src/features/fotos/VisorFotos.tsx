// Visor de fotos a pantalla completa: deslizar o flechas para pasar, tocar afuera para cerrar
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { signedUrls, type ShiftPhoto } from '../../lib/fotos'
import type { Member } from '../../lib/supabase'

interface Props {
  photos: ShiftPhoto[]
  start?: number
  members: Member[]
  timeZone: string
  title?: string
  onClose: () => void
  onRemove?: (p: ShiftPhoto) => void
  canRemove?: (p: ShiftPhoto) => boolean // si se puede quitar la foto que se está viendo
}

export function VisorFotos({ photos, start = 0, members, timeZone, title, onClose, onRemove, canRemove }: Props) {
  const [i, setI] = useState(start)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [touchX, setTouchX] = useState<number | null>(null)
  const p = photos[Math.min(i, photos.length - 1)]

  useEffect(() => {
    void signedUrls(photos.map((x) => x.path)).then(setUrls)
  }, [photos])

  useEffect(() => {
    if (!photos.length) onClose()
  }, [photos.length, onClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setI((n) => Math.min(n + 1, photos.length - 1))
      if (e.key === 'ArrowLeft') setI((n) => Math.max(n - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [photos.length, onClose])

  if (!p) return null
  const who = members.find((m) => m.user_id === p.uploadedBy)?.profile.display_name ?? 'Alguien'
  const when = new Intl.DateTimeFormat('es-CL', { timeZone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(p.createdAt))

  return createPortal(
    <div
      className="visor"
      role="dialog"
      aria-modal="true"
      aria-label={title ?? 'Fotos'}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX === null) return
        const dx = e.changedTouches[0].clientX - touchX
        if (dx < -40) setI((n) => Math.min(n + 1, photos.length - 1))
        if (dx > 40) setI((n) => Math.max(n - 1, 0))
        setTouchX(null)
      }}
    >
      <div className="visor-top">
        <div>
          {title && <b>{title}</b>}
          <div className="small">
            📷 {who} · {when}
          </div>
        </div>
        <button className="visor-close" onClick={onClose} aria-label="Cerrar">
          ✕
        </button>
      </div>
      <div className="visor-img" onClick={(e) => e.target === e.currentTarget && onClose()}>
        {urls[p.path] ? <img key={p.id} src={urls[p.path]} alt={`Foto ${i + 1} de ${photos.length}`} /> : <div className="spinner" />}
      </div>
      <div className="visor-bottom">
        <button className="visor-nav" disabled={i === 0} onClick={() => setI(i - 1)} aria-label="Foto anterior">
          ‹
        </button>
        <span className="small">
          {i + 1} de {photos.length}
        </span>
        <button className="visor-nav" disabled={i >= photos.length - 1} onClick={() => setI(i + 1)} aria-label="Foto siguiente">
          ›
        </button>
      </div>
      {onRemove && (canRemove?.(p) ?? true) && (
        <button className="btn btn-ghost btn-small visor-remove" onClick={() => onRemove(p)}>
          🗑️ Quitar esta foto
        </button>
      )}
    </div>,
    document.body,
  )
}
