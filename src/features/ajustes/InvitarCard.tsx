// Solo admins: genera un código (válido 7 días) y un enlace para compartir por WhatsApp
import { useState } from 'react'
import { inviteLink } from '../../core/invite'
import { appBaseUrl } from '../../lib/config'
import { mensajeError } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import { useApp } from '../../state/AppState'

type Tipo = 'limpia' | 'admin'

export function InvitarCard() {
  const { household } = useApp()
  const [tipo, setTipo] = useState<Tipo>('limpia')
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  async function generate() {
    setError('')
    setCopied(false)
    const { data, error: err } = await supabase.rpc('create_invitation', {
      p_household: household!.id,
      p_role: tipo === 'admin' ? 'admin' : 'member',
      p_participates: tipo === 'limpia',
    })
    if (err) return setError(mensajeError(err))
    setCode(data as string)
  }

  const link = code ? inviteLink(appBaseUrl(), code) : ''
  const text = `Únete a "${household?.name}" en Casa Limpia: ${link} (código ${code})`

  async function share() {
    if (navigator.share) {
      await navigator.share({ title: 'Casa Limpia', text }).catch(() => undefined)
    } else {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    }
  }

  return (
    <section className="card stack">
      <h2>Invitar a la familia</h2>
      <div className="segmented">
        <button className={tipo === 'limpia' ? 'on' : ''} onClick={() => { setTipo('limpia'); setCode(null) }}>
          Hace turnos
        </button>
        <button className={tipo === 'admin' ? 'on' : ''} onClick={() => { setTipo('admin'); setCode(null) }}>
          Admin sin turnos
        </button>
      </div>
      {code ? (
        <>
          <div className="code-box">{code}</div>
          <p className="small muted">Válido por 7 días. Pueden escribir el código en la app o abrir el enlace.</p>
          <button className="btn btn-block" onClick={share}>
            📤 Compartir invitación
          </button>
          {copied && <div className="alert alert-ok">Copiado. Pégalo en WhatsApp.</div>}
        </>
      ) : (
        <button className="btn btn-soft btn-block" onClick={generate}>
          Generar código
        </button>
      )}
      {error && <div className="alert alert-error">{error}</div>}
    </section>
  )
}
