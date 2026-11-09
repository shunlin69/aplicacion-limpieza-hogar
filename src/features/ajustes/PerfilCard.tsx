import { useEffect, useState } from 'react'
import { mensajeError } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import { useApp } from '../../state/AppState'
import { Avatar } from '../../ui/Avatar'
import { PROFILE_AVATARS, PROFILE_COLORS } from '../../ui/theme'

export function PerfilCard() {
  const { profile, refresh } = useApp()
  const [name, setName] = useState(profile?.display_name ?? '')
  const [avatar, setAvatar] = useState(profile?.avatar ?? '🧽')
  const [color, setColor] = useState(profile?.color ?? PROFILE_COLORS[0])
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (!profile) return
    setName(profile.display_name)
    setAvatar(profile.avatar)
    setColor(profile.color)
  }, [profile])

  if (!profile) return null
  const dirty = name !== profile.display_name || avatar !== profile.avatar || color !== profile.color

  async function save() {
    const { error } = await supabase.from('profiles').update({ display_name: name.trim(), avatar, color }).eq('id', profile!.id)
    setMsg(error ? { ok: false, text: mensajeError(error) } : { ok: true, text: 'Perfil guardado' })
    if (!error) await refresh()
  }

  return (
    <section className="card stack">
      <h2>Mi perfil</h2>
      <div className="row">
        <Avatar profile={{ avatar, color }} large />
        <input className="input" style={{ flex: 1 }} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label="Tu nombre" />
      </div>
      <div className="emoji-grid">
        {PROFILE_AVATARS.map((a) => (
          <button key={a} type="button" className={`emoji-btn${a === avatar ? ' on' : ''}`} onClick={() => setAvatar(a)} aria-label={`Avatar ${a}`}>
            {a}
          </button>
        ))}
      </div>
      <div className="swatches">
        {PROFILE_COLORS.map((c) => (
          <button key={c} type="button" className={`swatch${c === color ? ' on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Color ${c}`} />
        ))}
      </div>
      {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-error'}`}>{msg.text}</div>}
      <button className="btn btn-block" disabled={!dirty || !name.trim()} onClick={save}>
        Guardar perfil
      </button>
    </section>
  )
}
