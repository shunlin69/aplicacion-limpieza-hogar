// Resumen de la semana pasada e historial de todo lo que pasó en la casa
import { compliance, ranking, weekPeriod, inPeriod, type LedgerEntry, type ShiftResult } from '../../core/ranking'
import { addDays, isoWeekday, WEEKDAY_NAMES, type LocalDate } from '../../core/dates'
import type { Activity } from '../../hooks/useScores'
import type { Member } from '../../lib/supabase'
import { Avatar } from '../../ui/Avatar'

const fmtDay = (d: string) => new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`))
const dayName = (d: unknown) => (typeof d === 'string' ? `${WEEKDAY_NAMES[isoWeekday(d)].toLowerCase()} ${fmtDay(d)}` : '')

interface Props {
  members: Member[]
  ledger: LedgerEntry[]
  results: ShiftResult[]
  activity: Activity[]
  thisMonday: LocalDate
  timeZone: string
}

export function Historial({ members, ledger, results, activity, thisMonday, timeZone }: Props) {
  const byUser = (uid: string | null) => members.find((m) => m.user_id === uid)?.profile.display_name ?? 'Alguien'
  const byMember = (id: unknown) => members.find((m) => m.id === id)?.profile.display_name ?? 'alguien'

  // Resumen de la semana pasada
  const lastMonday = addDays(thisMonday, -7)
  const period = weekPeriod(lastMonday)
  const lastWeek = results.filter((r) => inPeriod(r.date, period))
  const ids = members.filter((m) => m.participates).map((m) => m.id)
  const rows = ranking(ids, ledger, results, period).filter((r) => r.done + r.late + r.missed > 0)
  const house = compliance(lastWeek.map((r) => r.status))
  const best = rows[0]

  const text = (a: Activity): { icon: string; msg: string } => {
    const p = a.payload
    const pts = typeof p.puntos === 'number' ? ` (${p.puntos > 0 ? '+' : ''}${p.puntos})` : ''
    switch (a.verb) {
      case 'turno_hecho': return { icon: '✅', msg: `${byUser(a.actorUserId)} terminó su turno del ${dayName(p.fecha)}${pts}` }
      case 'turno_tarde': return { icon: '⏰', msg: `${byUser(a.actorUserId)} terminó tarde su turno del ${dayName(p.fecha)}${pts}` }
      case 'turno_no_hecho': return { icon: '❌', msg: `El turno del ${dayName(p.fecha)}${p.integrante ? ` de ${byMember(p.integrante)}` : ''} quedó sin hacer${pts}` }
      case 'turno_deshecho': return { icon: '↩️', msg: `${byUser(a.actorUserId)} deshizo su turno del ${dayName(p.fecha)}` }
      case 'semana_repartida': return { icon: '📅', msg: `Se repartió la semana ${p.numero ?? ''} (desde el ${dayName(p.semana)})` }
      case 'semana_recalculada': return { icon: '🔁', msg: `${byUser(a.actorUserId)} recalculó la semana del ${dayName(p.semana)}` }
      case 'sorteo_rotacion': return { icon: '🎲', msg: `${byUser(a.actorUserId)} sorteó el orden: ${Array.isArray(p.orden) ? p.orden.join(', ') : ''}` }
      case 'cambio_pedido': return { icon: '🔄', msg: `${byMember(p.integrante)} pidió ${p.fecha_otro ? `cambiar su turno del ${dayName(p.fecha)} con ${byMember(p.otro)}` : `que ${byMember(p.otro)} lo cubra el ${dayName(p.fecha)}`}` }
      case 'cambio_aceptado': return { icon: '🤝', msg: `${byMember(p.otro)} aceptó el cambio con ${byMember(p.integrante)}` }
      case 'cambio_rechazado': return { icon: '🙅', msg: `${byMember(p.otro)} no aceptó el cambio con ${byMember(p.integrante)}` }
      case 'cambio_aprobado': return { icon: '👍', msg: `${byUser(a.actorUserId)} aprobó el cambio entre ${byMember(p.integrante)} y ${byMember(p.otro)}` }
      case 'cambio_no_aprobado': return { icon: '⛔', msg: `${byUser(a.actorUserId)} no aprobó el cambio entre ${byMember(p.integrante)} y ${byMember(p.otro)}` }
      case 'cambio_cancelado': return { icon: '✖️', msg: `${byMember(p.integrante)} canceló su pedido de cambio` }
      default: return { icon: '•', msg: a.verb }
    }
  }
  const when = (iso: string) =>
    new Intl.DateTimeFormat('es-CL', { timeZone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

  return (
    <>
      <div className="card stack">
        <h2 style={{ marginBottom: 0 }}>📊 Semana pasada</h2>
        <p className="small muted">
          {fmtDay(period.from)} al {fmtDay(period.to)}
        </p>
        {lastWeek.length === 0 ? (
          <p className="muted">No hubo turnos esa semana.</p>
        ) : (
          <>
            <div className="summary-grid">
              <div><b>{lastWeek.filter((r) => r.status === 'done').length}</b><span>a tiempo</span></div>
              <div><b>{lastWeek.filter((r) => r.status === 'late_done').length}</b><span>tarde</span></div>
              <div><b>{lastWeek.filter((r) => r.status === 'missed').length}</b><span>sin hacer</span></div>
              <div><b>{house ?? '–'}%</b><span>la casa</span></div>
            </div>
            {best && best.points > 0 && (
              <div className="row">
                {(() => {
                  const m = members.find((x) => x.id === best.memberId)
                  return m ? <Avatar profile={m.profile} /> : null
                })()}
                <p>
                  🌟 Destacado: <b>{byMember(best.memberId)}</b> con {best.points} pts
                </p>
              </div>
            )}
          </>
        )}
      </div>

      <div className="card stack">
        <h2 style={{ marginBottom: 0 }}>🕓 Historial de la casa</h2>
        {activity.length === 0 && <p className="muted">Todavía no pasa nada por aquí.</p>}
        <ul className="feed">
          {activity.map((a) => {
            const t = text(a)
            return (
              <li key={a.id}>
                <span className="feed-icon">{t.icon}</span>
                <div>
                  <div>{t.msg}</div>
                  <div className="small muted">{when(a.createdAt)}</div>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </>
  )
}
