// Tarjeta de un turno: quién, qué espacios, puntos y por qué le tocó
import type { ReactNode } from 'react'
import { pointsForStatus } from '../core/completion'
import type { WeekShift } from '../hooks/useWeek'
import type { Member } from '../lib/supabase'
import { Avatar } from './Avatar'

const REASON_TEXT: Partial<Record<WeekShift['reason'], (orig: string) => string>> = {
  cubre_ausencia: (o) => `Cubre a ${o}`,
  pago_deuda: (o) => `Devuelve un turno a ${o}`,
  intercambio: (o) => `Intercambio con ${o}`,
  manual: () => 'Asignado por un admin',
}

const STATUS: Record<WeekShift['status'], { text: string; cls: string } | null> = {
  pending: null,
  done: { text: 'Hecho ✓', cls: 'status-done' },
  late_done: { text: 'Hecho tarde', cls: 'status-late' },
  missed: { text: 'No hecho', cls: 'status-missed' },
}

interface Props {
  shift: WeekShift
  members: Member[]
  meId?: string
  compact?: boolean
  checked?: string[] // ítems ya marcados (progreso en vivo)
  late?: boolean // pendiente y ya pasó su día
  footer?: ReactNode // acciones extra (ej: pedir cambio)
}

export function ShiftCard({ shift, members, meId, compact, checked = [], late, footer }: Props) {
  const who = members.find((m) => m.id === shift.memberId)
  const orig = members.find((m) => m.id === shift.originalMemberId)
  const reason = REASON_TEXT[shift.reason]?.(orig?.profile.display_name ?? 'otro')
  const base = STATUS[shift.status]
  const earned = pointsForStatus(shift.status, shift.points)
  const status = base
    ? { ...base, text: `${base.text} ${earned > 0 ? '+' : ''}${earned}` }
    : late
      ? { text: 'Atrasado ⏰', cls: 'status-pending-late' }
      : null
  const total = shift.spaces.reduce((n, sp) => n + (sp.items?.length ?? 0), 0)
  const progress = shift.status === 'pending' && checked.length > 0 && total > 0 ? checked.length / total : null
  const mine = !!meId && shift.memberId === meId
  return (
    <div className={`shift${mine ? ' shift-mine' : ''}`}>
      <div className="row-between">
        <div className="row" style={{ minWidth: 0 }}>
          {who ? <Avatar profile={who.profile} /> : <span className="avatar" style={{ background: 'var(--surface-2)' }}>❔</span>}
          <div style={{ minWidth: 0 }}>
            <div className="member-name">
              {who ? who.profile.display_name : 'Sin asignar'} {mine && <span className="badge badge-me">Tú</span>}
            </div>
            {!compact && <div className="small muted">{shift.templateName}</div>}
          </div>
        </div>
        <div className="points-pill">{shift.points} pts</div>
      </div>
      <div className="chips">
        {shift.spaces.map((s) => (
          <span key={s.id} className="chip">
            {s.icon} {s.name}
          </span>
        ))}
      </div>
      {progress !== null && (
        <div className="stack" style={{ gap: 4 }}>
          <span className="small muted">
            Limpiando… {checked.length} de {total}
          </span>
          <div className="progress">
            <span style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      )}
      {(reason || status) && (
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          {reason && <span className="badge badge-info">{reason}</span>}
          {status && <span className={`badge ${status.cls}`}>{status.text}</span>}
        </div>
      )}
      {footer && <div className="row" style={{ justifyContent: 'flex-end' }}>{footer}</div>}
    </div>
  )
}
