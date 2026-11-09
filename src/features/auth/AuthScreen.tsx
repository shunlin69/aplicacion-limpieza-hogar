import { useState, type FormEvent } from 'react'
import { mensajeError } from '../../lib/errors'
import { supabase } from '../../lib/supabase'

type Mode = 'entrar' | 'crear'

export function AuthScreen({ inviteCode }: { inviteCode?: string }) {
  const [mode, setMode] = useState<Mode>(inviteCode ? 'crear' : 'entrar')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'crear') {
        // La cuenta se crea en el servidor (Edge Function "signup") ya confirmada
        const { error: fnError } = await supabase.functions.invoke('signup', {
          body: { email, password, displayName: name },
        })
        if (fnError) {
          const body = await (fnError as { context?: Response }).context?.json?.().catch(() => null)
          throw new Error(body?.error ?? 'No se pudo crear la cuenta')
        }
      }
      const { error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (loginError) throw loginError
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="welcome">
      <img className="welcome-logo" src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" />
      <div className="stack">
        <h1>Casa Limpia</h1>
        <p className="page-sub">
          {inviteCode ? 'Te invitaron a un hogar. Crea tu cuenta o entra para unirte.' : 'Turnos justos, a la vista de todos. Sin discusiones.'}
        </p>
      </div>

      <div className="segmented" role="tablist">
        <button type="button" className={mode === 'entrar' ? 'on' : ''} onClick={() => setMode('entrar')}>
          Entrar
        </button>
        <button type="button" className={mode === 'crear' ? 'on' : ''} onClick={() => setMode('crear')}>
          Crear cuenta
        </button>
      </div>

      <form className="stack" onSubmit={submit}>
        {mode === 'crear' && (
          <div className="field">
            <label htmlFor="name">Tu nombre</label>
            <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required autoComplete="given-name" />
          </div>
        )}
        <div className="field">
          <label htmlFor="email">Correo</label>
          <input id="email" className="input" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </div>
        <div className="field">
          <label htmlFor="password">Contraseña {mode === 'crear' && <span className="muted">(mínimo 8)</span>}</label>
          <input
            id="password"
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={mode === 'crear' ? 8 : undefined}
            required
            autoComplete={mode === 'crear' ? 'new-password' : 'current-password'}
          />
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        <button className="btn btn-block" disabled={busy}>
          {busy ? 'Un momento…' : mode === 'crear' ? 'Crear mi cuenta' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
