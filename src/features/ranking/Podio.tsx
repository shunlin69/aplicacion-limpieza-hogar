// Podio animado: las columnas suben y los puntos cuentan hacia arriba
import type { RankRow } from '../../core/ranking'
import type { Member } from '../../lib/supabase'
import { Avatar } from '../../ui/Avatar'
import { useCountUp } from '../../ui/useCountUp'

const HEIGHT: Record<number, number> = { 0: 96, 1: 68, 2: 48 } // 1º, 2º, 3º
const MEDAL = ['🥇', '🥈', '🥉']

function Columna({ row, member, place }: { row: RankRow; member: Member; place: number }) {
  const pts = useCountUp(Math.max(row.points, 0), 900, 300 + place * 150)
  return (
    <div className={`podio-col podio-${place + 1}`}>
      <div className="podio-who" style={{ animationDelay: `${0.5 + place * 0.15}s` }}>
        {place === 0 && <span className="podio-crown">👑</span>}
        <Avatar profile={member.profile} large={place === 0} />
        <b className="podio-name">{member.profile.display_name}</b>
        <span className="small muted">{pts} pts</span>
      </div>
      <div className="podio-bar" style={{ height: HEIGHT[place], animationDelay: `${place * 0.15}s` }}>
        <span>{MEDAL[place]}</span>
      </div>
    </div>
  )
}

export function Podio({ rows, members }: { rows: RankRow[]; members: Member[] }) {
  const top = rows.filter((r) => r.points > 0).slice(0, 3)
  if (!top.length) return null
  // Orden visual: 2º, 1º, 3º
  const order = [1, 0, 2].filter((i) => top[i])
  return (
    <div className="podio" key={top.map((r) => r.memberId + r.points).join()}>
      {order.map((i) => {
        const m = members.find((x) => x.id === top[i].memberId)
        return m ? <Columna key={top[i].memberId} row={top[i]} member={m} place={i} /> : null
      })}
    </div>
  )
}
