// Primera vez: crear un hogar (administrador) o unirse con un código
import { useEffect, useState, type FormEvent } from 'react'
import { codeFromInput, isValidInviteCode } from '../../core/invite'
import { mensajeError } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import { useApp } from '../../state/AppState'

export function OnboardingScreen({ inviteCode, onDone }: { inviteCode?: string; onDone: () => void }) {
  const { profile, refresh } = useApp()
  const [mode, setMode] = useState<'unirse' | 'crear'>('unirse')
  const [code, setCode] = useState(inviteCode ?? '')
  const [preview, setPreview] = useState<string | null>(null)
  const [houseName, setHouseName] = useState('')
  const [participates, setParticipates] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const clean = codeFromInput(code)

  // Muestra a qué hogar lleva el código antes de confirmar
  useEffect(() => {
    setPreview(null)
    if (!isValidInviteCode(clean)) return
    let cancel = false
    supabase.rpc('preview_invitation', { p_code: clean }).then(({ data }) => {
      if (!cancel) setPreview(data?.[0]?.household_name ?? '')
    })
    return () => {
      cancel = true
    }
  }, [clean])

  async function join(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error: err } = await supabase.rpc('join_household', { p_code: clean })
    setBusy(false)
    if (err) return setError(mensajeError(err))
    await refresh()
    onDone()
  }

  async function create(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error: err } = await supabase.rpc('create_household', { p_name: houseName, p_participates: participates })
    setBusy(false)
    if (err) return setError(mensajeError(err))
    await refresh()
    onDone()
  }

  return (
    <div className="welcome">
      <div className="stack">
        <h1>¡Hola{profile?.display_name ? `, ${profile.display_name}` : ''}! 👋</h1>
        <p className="page-sub">Únete al hogar de tu familia o crea uno nuevo.</p>
      </div>

      <div className="segmented">
        <button type="button" className={mode === 'unirse' ? 'on' : ''} onClick={() => setMode('unirse')}>
          Tengo un código
        </button>
        <button type="button" className={mode === 'crear' ? 'on' : ''} onClick={() => setMode('crear')}>
          Crear hogar
        </button>
      </div>

      {mode === 'unirse' ? (
        <form className="stack" onSubmit={join}>
          <div className="field">
            <label htmlFor="code">Código de invitación</label>
            <input id="code" className="input input-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABC123" autoCapitalize="characters" autoComplete="off" />
          </div>
          {preview && <div className="alert alert-ok">Te unirás a: <b>{preview}</b></div>}
          {preview === '' && <div className="alert alert-error">Ese código no existe o ya expiró</div>}
          {error && <div className="alert alert-error">{error}</div>}
          <button className="btn btn-block" disabled={busy || !preview}>
            {busy ? 'Uniéndote…' : 'Unirme'}
          </button>
        </form>
      ) : (
        <form className="stack" onSubmit={create}>
          <div className="field">
            <label htmlFor="house">Nombre del hogar</label>
            <input id="house" className="input" value={houseName} onChange={(e) => setHouseName(e.target.value)} placeholder="Casa Pérez" maxLength={60} required />
          </div>
          <div className="field">
            <label>¿Tú también harás turnos de limpieza?</label>
            <div className="segmented">
              <button type="button" className={participates ? 'on' : ''} onClick={() => setParticipates(true)}>
                Sí, también limpio
              </button>
              <button type="button" className={!participates ? 'on' : ''} onClick={() => setParticipates(false)}>
                Solo administro
              </button>
            </div>
          </div>
          <div className="alert alert-info small">¿Tu familia ya usa Casa Limpia? No crees otro hogar: pide el código de invitación a un admin.</div>
          <p className="small muted">Serás administrador: podrás invitar a la familia y configurar los turnos.</p>
          {error && <div className="alert alert-error">{error}</div>}
          <button className="btn btn-block" disabled={busy}>
            {busy ? 'Creando…' : 'Crear hogar'}
          </button>
        </form>
      )}
      <button className="btn btn-ghost" onClick={() => supabase.auth.signOut()}>
        Cerrar sesión
      </button>
    </div>
  )
}
