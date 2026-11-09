// Integrantes del hogar. Un admin puede cambiar el rol y si participa en turnos.
import { useState } from 'react'
import { mensajeError } from '../../lib/errors'
import { supabase, type Member } from '../../lib/supabase'
import { useApp } from '../../state/AppState'
import { Avatar } from '../../ui/Avatar'

export function HogarCard() {
  const { household, members, isAdmin, me, refresh } = useApp()
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function update(m: Member, role: Member['role'], participates: boolean) {
    setError('')
    const { error: err } = await supabase.rpc('update_member', { p_member: m.id, p_role: role, p_participates: participates })
    if (err) setError(mensajeError(err))
    await refresh()
  }

  return (
    <section className="card stack">
      <h2>🏠 {household?.name}</h2>
      <div>
        {members.map((m) => (
          <div key={m.id}>
            <div className="member">
              <Avatar profile={m.profile} />
              <div style={{ flex: 1 }}>
                <div className="member-name">
                  {m.profile.display_name || 'Sin nombre'} {m.id === me?.id && <span className="muted small">(tú)</span>}
                </div>
                <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  {m.role === 'admin' && <span className="badge badge-admin">Admin</span>}
                  <span className="badge">{m.participates ? 'Hace turnos' : 'No hace turnos'}</span>
                </div>
              </div>
              {isAdmin && (
                <button className="btn btn-soft btn-small" onClick={() => setEditing(editing === m.id ? null : m.id)}>
                  {editing === m.id ? 'Listo' : 'Editar'}
                </button>
              )}
            </div>
            {isAdmin && editing === m.id && (
              <div className="stack" style={{ paddingBottom: 10 }}>
                <div className="segmented">
                  <button className={m.role === 'admin' ? 'on' : ''} onClick={() => update(m, 'admin', m.participates)}>
                    Administrador
                  </button>
                  <button className={m.role === 'member' ? 'on' : ''} onClick={() => update(m, 'member', m.participates)}>
                    Integrante
                  </button>
                </div>
                <div className="segmented">
                  <button className={m.participates ? 'on' : ''} onClick={() => update(m, m.role, true)}>
                    Hace turnos
                  </button>
                  <button className={!m.participates ? 'on' : ''} onClick={() => update(m, m.role, false)}>
                    No hace turnos
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      {error && <div className="alert alert-error">{error}</div>}
    </section>
  )
}
