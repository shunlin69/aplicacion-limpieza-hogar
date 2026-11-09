// Tarjeta de un turno: quién, qué espacios, puntos y por qué le tocó
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

export function ShiftCard({ shift, members, meId, compact }: { shift: WeekShift; members: Member[]; meId?: string; compact?: boolean }) {
  const who = members.find((m) => m.id === shift.memberId)
  const orig = members.find((m) => m.id === shift.originalMemberId)
  const reason = REASON_TEXT[shift.reason]?.(orig?.profile.display_name ?? 'otro')
  const status = STATUS[shift.status]
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
      {(reason || status) && (
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          {reason && <span className="badge badge-info">{reason}</span>}
          {status && <span className={`badge ${status.cls}`}>{status.text}</span>}
        </div>
      )}
    </div>
  )
}
