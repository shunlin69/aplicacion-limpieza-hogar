// Activar notificaciones en este celular y enviar una de prueba
import { useEffect, useState } from 'react'
import { mensajeError } from '../../lib/errors'
import { isIOS, isStandalone, pushSupported } from '../../lib/platform'
import { disablePush, enablePush, pushActiveHere, sendTestPush } from '../../lib/push'
import { supabase } from '../../lib/supabase'
import { useApp } from '../../state/AppState'

const HORARIOS = [
  { value: '10:00', label: '10:00' },
  { value: '11:00', label: '11:00' },
  { value: '12:00', label: '12:00' },
  { value: '16:00', label: '16:00' },
]

export function NotificacionesCard() {
  const { session, me, refresh } = useApp()
  const [active, setActive] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const needsInstall = isIOS() && !isStandalone()
  const supported = pushSupported()

  useEffect(() => {
    pushActiveHere().then(setActive)
  }, [])

  async function run(fn: () => Promise<string>) {
    setBusy(true)
    setMsg(null)
    try {
      setMsg({ ok: true, text: await fn() })
    } catch (e) {
      setMsg({ ok: false, text: mensajeError(e) })
    } finally {
      setBusy(false)
    }
  }

  async function setHorario(value: string) {
    if (!me) return
    await supabase.from('household_members').update({ reminder_time: value }).eq('id', me.id)
    await refresh()
  }

  return (
    <section className="card stack">
      <h2>🔔 Notificaciones</h2>
      {needsInstall ? (
        <div className="alert alert-info stack">
          <b>En iPhone, primero instala la app:</b>
          <ol className="steps">
            <li>Toca el botón Compartir de Safari (cuadrado con flecha).</li>
            <li>Elige “Agregar a pantalla de inicio”.</li>
            <li>Abre Casa Limpia desde el ícono nuevo y vuelve aquí.</li>
          </ol>
        </div>
      ) : !supported ? (
        <div className="alert alert-error">Este navegador no permite notificaciones. Prueba con Chrome (Android) o Safari (iPhone).</div>
      ) : active ? (
        <>
          <div className="alert alert-ok">Activadas en este celular ✅</div>
          <button className="btn btn-block" disabled={busy} onClick={() => run(async () => {
            const n = await sendTestPush()
            return `Prueba enviada a ${n} ${n === 1 ? 'celular' : 'celulares'}. Debería llegar en unos segundos.`
          })}>
            Enviarme una notificación de prueba
          </button>
          <button className="btn btn-ghost" disabled={busy} onClick={() => run(async () => {
            await disablePush()
            setActive(false)
            return 'Notificaciones desactivadas en este celular'
          })}>
            Desactivar en este celular
          </button>
        </>
      ) : (
        <button className="btn btn-block" disabled={busy} onClick={() => run(async () => {
          await enablePush(session!.user.id)
          setActive(true)
          return '¡Listo! Ahora prueba enviarte una notificación.'
        })}>
          Activar notificaciones
        </button>
      )}
      {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-error'}`}>{msg.text}</div>}

      {me?.participates && (
        <div className="field">
          <label>¿A qué hora te aviso el día de tu turno?</label>
          <div className="segmented">
            {HORARIOS.map((h) => (
              <button key={h.value} className={me.reminder_time.startsWith(h.value) ? 'on' : ''} onClick={() => setHorario(h.value)}>
                {h.label}
              </button>
            ))}
          </div>
          <p className="small muted">Además: domingo 20:00 con tu turno de la semana, y 21:00 si quedó pendiente.</p>
        </div>
      )}
    </section>
  )
}
