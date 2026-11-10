// Premios del mes: el admin los define y todos ven cuánto les falta
import { useState } from 'react'
import { rewardProgress, type RankRow, type Reward } from '../../core/ranking'
import { mensajeError } from '../../lib/errors'
import { supabase, type Member } from '../../lib/supabase'
import { Avatar } from '../../ui/Avatar'

const ICONS = ['🎁', '🍕', '🎬', '🍦', '🎮', '💸', '🛌', '📱', '🍩', '🎟️']

interface Props {
  householdId: string
  rewards: Reward[]
  rows: RankRow[] // ranking del mes
  members: Member[]
  isAdmin: boolean
  onChanged: () => void
}

export function PremiosCard({ householdId, rewards, rows, members, isAdmin, onChanged }: Props) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState(ICONS[0])
  const [points, setPoints] = useState(40)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const add = async () => {
    if (!name.trim()) return setError('Ponle un nombre al premio')
    setBusy(true)
    setError('')
    const { error: e } = await supabase.from('rewards').insert({ household_id: householdId, name: name.trim(), icon, points_needed: points })
    setBusy(false)
    if (e) return setError(mensajeError(e))
    setName('')
    setAdding(false)
    onChanged()
  }

  const remove = async (r: Reward) => {
    if (!confirm(`¿Quitar el premio "${r.name}"?`)) return
    const { error: e } = await supabase.from('rewards').delete().eq('id', r.id)
    if (e) setError(mensajeError(e))
    onChanged()
  }

  return (
    <div className="card stack">
      <h2 style={{ marginBottom: 0 }}>🎁 Premios del mes</h2>
      <p className="small muted">Se gana un premio al juntar sus puntos dentro del mes. El 1 de cada mes se parte de cero.</p>

      {rewards.length === 0 && <p className="muted">{isAdmin ? 'Aún no hay premios. Agrega el primero.' : 'Aún no hay premios. Un admin puede agregarlos.'}</p>}

      {rewards.map((r) => (
        <div key={r.id} className="reward">
          <div className="row-between">
            <div className="row" style={{ minWidth: 0 }}>
              <span className="space-icon">{r.icon}</span>
              <div style={{ minWidth: 0 }}>
                <div className="member-name">{r.name}</div>
                <div className="small muted">{r.pointsNeeded} pts en el mes</div>
              </div>
            </div>
            {isAdmin && (
              <button className="icon-btn" onClick={() => void remove(r)} aria-label={`Quitar ${r.name}`}>
                ✕
              </button>
            )}
          </div>
          {rows.map((row) => {
            const m = members.find((x) => x.id === row.memberId)
            if (!m) return null
            const p = rewardProgress(row.points, r)
            return (
              <div key={row.memberId} className="reward-person">
                <Avatar profile={m.profile} />
                <div className="stack" style={{ gap: 4, flex: 1, minWidth: 0 }}>
                  <div className="row-between small">
                    <b>{m.profile.display_name}</b>
                    <span>{p.earned ? '🎉 ¡Ganado!' : `faltan ${p.missing}`}</span>
                  </div>
                  <div className="progress">
                    <span style={{ width: `${p.ratio * 100}%`, background: p.earned ? 'var(--primary)' : undefined }} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ))}

      {isAdmin &&
        (adding ? (
          <div className="stack edit-zone">
            <div className="chips">
              {ICONS.map((i) => (
                <button key={i} className={`emoji-btn${icon === i ? ' on' : ''}`} style={{ width: 44 }} onClick={() => setIcon(i)}>
                  {i}
                </button>
              ))}
            </div>
            <input className="input" placeholder="Ej: elegir la película del sábado" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            <div className="row-between">
              <span className="member-name">Puntos necesarios</span>
              <div className="stepper">
                <button className="btn btn-soft" onClick={() => setPoints((p) => Math.max(5, p - 5))}>−</button>
                <b style={{ minWidth: 36, textAlign: 'center' }}>{points}</b>
                <button className="btn btn-soft" onClick={() => setPoints((p) => Math.min(1000, p + 5))}>+</button>
              </div>
            </div>
            <p className="small muted">Como referencia: quien cumple todo a tiempo junta unos 45 a 50 puntos al mes.</p>
            <div className="row">
              <button className="btn btn-soft" onClick={() => setAdding(false)}>Cancelar</button>
              <button className="btn" style={{ flex: 1 }} onClick={add} disabled={busy}>Guardar premio</button>
            </div>
          </div>
        ) : (
          <button className="btn btn-soft btn-block" onClick={() => setAdding(true)}>+ Agregar premio</button>
        ))}
      {error && <div className="alert alert-error">{error}</div>}
    </div>
  )
}
