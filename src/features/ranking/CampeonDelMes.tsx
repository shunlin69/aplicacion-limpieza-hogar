// Durante la primera semana de cada mes, al abrir la app aparece un regalo:
// al tocarlo se revela quién ganó el mes anterior (con fanfarria y confeti)
// y qué premios se ganaron. Se muestra una sola vez por persona y mes.
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { localDateOf } from '../../core/dates'
import { champions, previousMonth, ranking, rewardProgress } from '../../core/ranking'
import { useScores } from '../../hooks/useScores'
import { playFanfare } from '../../lib/celebrate'
import { useApp } from '../../state/AppState'
import { Avatar } from '../../ui/Avatar'
import { Celebracion } from '../../ui/Celebracion'

const DIAS_VISIBLE = 7
const mesNombre = (d: string) => new Intl.DateTimeFormat('es-CL', { month: 'long', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`))

function yaVisto(key: string) {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}
function marcarVisto(key: string) {
  try {
    localStorage.setItem(key, '1')
  } catch {
    /* sin almacenamiento: se volverá a mostrar, no es grave */
  }
}

export function CampeonDelMes() {
  const { household, members, me } = useApp()
  const tz = household?.timezone ?? 'America/Santiago'
  const today = localDateOf(new Date(), tz)
  const prev = useMemo(() => previousMonth(today), [today])
  const key = `casa-limpia:campeon:${household?.id}:${prev.from}:${me?.id}`
  const [estado, setEstado] = useState<'regalo' | 'revelado' | 'cerrado'>(() => (yaVisto(key) ? 'cerrado' : 'regalo'))
  // Solo carga los puntos cuando de verdad puede mostrarse
  const activo = estado !== 'cerrado' && Number(today.slice(8)) <= DIAS_VISIBLE && !!me
  const { ledger, results, rewards, loading } = useScores(activo ? household : null)

  const rows = useMemo(() => {
    const ids = members.filter((m) => m.participates || ledger.some((e) => e.memberId === m.id)).map((m) => m.id)
    return ranking(ids, ledger, results, prev)
  }, [members, ledger, results, prev])
  const winners = champions(rows)

  if (!activo || !me || loading || !winners.length) return null

  const cerrar = () => {
    marcarVisto(key)
    setEstado('cerrado')
  }
  const mes = mesNombre(prev.from)
  // El resto de la tabla (el campeón ya está arriba, en grande)
  const resto = rows.filter((r) => !winners.some((w) => w.memberId === r.memberId)).slice(0, 3)
  const soyYo = winners.some((w) => w.memberId === me.id)
  const ganados = rows.flatMap((r) =>
    rewards.filter((rw) => rewardProgress(r.points, rw).earned).map((rw) => ({ row: r, reward: rw })),
  )

  if (estado === 'regalo') {
    return createPortal(
      <div className="celebra" role="dialog" aria-modal="true" aria-label={`Resultado de ${mes}`}>
        <button
          className="regalo"
          onClick={() => {
            playFanfare()
            setEstado('revelado')
          }}
        >
          <span className="regalo-caja" aria-hidden>🎁</span>
          <b className="celebra-title">¡Terminó {mes}!</b>
          <span className="muted">Toca para ver quién se lleva el trofeo</span>
        </button>
      </div>,
      document.body,
    )
  }

  return (
    <Celebracion
      variant="trofeo"
      title={`El trofeo de ${mes} es para…`}
      subtitle={soyYo ? '¡Eres tú! 🎉 Gracias por dejar la casa impecable.' : undefined}
      buttonText="¡Felicitaciones!"
      onClose={cerrar}
    >
      <div className="campeones">
        {winners.map((w) => {
          const m = members.find((x) => x.id === w.memberId)
          return m ? (
            <div key={w.memberId} className="campeon">
              <span className="podio-crown">👑</span>
              <Avatar profile={m.profile} large />
              <b>{m.profile.display_name}</b>
              <span className="points-pill">{w.points} pts</span>
            </div>
          ) : null
        })}
      </div>
      {resto.length > 0 && (
        <div className="campeon-resto">
          {resto.map((r) => {
            const m = members.find((x) => x.id === r.memberId)
            return m ? (
              <div key={r.memberId} className="campeon-resto-fila">
                <span className="muted">{r.position}°</span>
                <Avatar profile={m.profile} />
                <b>{m.profile.display_name}</b>
                <span className="muted">{r.points} pts</span>
              </div>
            ) : null
          })}
        </div>
      )}
      {ganados.length > 0 && (
        <div className="stack" style={{ gap: 6, width: '100%', textAlign: 'left' }}>
          <b className="small">🎁 Premios ganados en {mes}</b>
          {ganados.map(({ row, reward }) => (
            <div key={row.memberId + reward.id} className="small">
              {reward.icon} <b>{members.find((m) => m.id === row.memberId)?.profile.display_name}</b>: {reward.name}
            </div>
          ))}
        </div>
      )}
    </Celebracion>
  )
}
