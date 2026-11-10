// Tabla de posiciones de un período (semana o mes)
import type { RankRow } from '../../core/ranking'
import type { Member } from '../../lib/supabase'
import { Avatar } from '../../ui/Avatar'

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

export function TablaPosiciones({ rows, members, meId }: { rows: RankRow[]; members: Member[]; meId?: string }) {
  if (!rows.length) return <p className="muted">Aún no hay integrantes con turnos.</p>
  return (
    <ol className="rank-list">
      {rows.map((r) => {
        const m = members.find((x) => x.id === r.memberId)
        if (!m) return null
        return (
          <li key={r.memberId} className={`rank-row${r.position === 1 && r.points > 0 ? ' rank-first' : ''}${r.memberId === meId ? ' rank-me' : ''}`}>
            <span className="rank-pos">{MEDAL[r.position] ?? r.position}</span>
            <Avatar profile={m.profile} />
            <div className="rank-info">
              <div className="member-name">{m.profile.display_name}</div>
              <div className="small muted rank-stats">
                <span>✓ {r.done}</span>
                {r.late > 0 && <span>⏰ {r.late}</span>}
                {r.missed > 0 && <span>✗ {r.missed}</span>}
                {r.compliance !== null && <span>{r.compliance}%</span>}
                {r.streak >= 2 && <span>🔥 {r.streak}</span>}
              </div>
            </div>
            <span className={`rank-points${r.points < 0 ? ' neg' : ''}`}>{r.points}</span>
          </li>
        )
      })}
    </ol>
  )
}
