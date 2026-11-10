// Edge Function: notificaciones push (Web Push con VAPID).
// Acciones:
//   { action: 'public-key' } -> devuelve la clave pública (la crea si no existe)
//   { action: 'test' }       -> envía una notificación de prueba a mis celulares
//   { action: 'cron' }       -> envía los avisos pendientes de notification_log
//                               (la llaman pg_cron y los cambios de turno, con x-cron-secret)
import { createClient } from 'npm:@supabase/supabase-js@2.49.4'
import webpush from 'npm:web-push@3.6.7'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// Identifica al remitente ante Apple/Google (debe ser https: o mailto:)
const VAPID_SUBJECT = 'https://shunlin69.github.io/aplicacion-limpieza-hogar/'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromB64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) =>
    c.charCodeAt(0),
  )

// Obtiene las claves VAPID; si no existen, genera un par P-256 nuevo y lo guarda.
async function getVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const { data, error } = await admin.rpc('get_vapid_keys').single<{ public_key: string | null; private_key: string | null }>()
  if (error) throw error
  if (data?.public_key && data?.private_key) return { publicKey: data.public_key, privateKey: data.private_key }

  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  // Clave pública "sin comprimir": 0x04 || x || y
  const raw = new Uint8Array([4, ...fromB64url(jwk.x!), ...fromB64url(jwk.y!)])
  const store = await admin.rpc('store_vapid_keys', { p_public: b64url(raw), p_private: jwk.d! })
  if (store.error) throw store.error
  // Relee por si otra ejecución guardó primero
  const again = await admin.rpc('get_vapid_keys').single<{ public_key: string; private_key: string }>()
  if (again.error) throw again.error
  return { publicKey: again.data.public_key, privateKey: again.data.private_key }
}

interface Sub {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
}

/** Envía un aviso a una suscripción. Devuelve true si llegó, o el código de error; borra las suscripciones muertas. */
async function sendTo(s: Sub, payload: string): Promise<true | string> {
  try {
    await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
      TTL: 60 * 60 * 6,
      urgency: 'high',
    })
    return true
  } catch (e) {
    // 404/410 = la suscripción ya no existe (app desinstalada): se borra
    const code = (e as { statusCode?: number }).statusCode
    if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('id', s.id)
    else console.error('push error', code, (e as Error).message)
    return `${code ?? 'red'} ${String((e as { body?: string }).body ?? (e as Error).message).slice(0, 80)}`
  }
}

// Avisos de más de 12 horas ya no sirven (ej: "hoy te toca" de ayer)
const MAX_AGE_MS = 12 * 60 * 60 * 1000

/** Envía todo lo pendiente de notification_log */
async function sendQueued() {
  // Reserva los avisos (evita envíos dobles si dos ejecuciones coinciden)
  const { data: rows, error } = await admin.rpc('claim_notifications', { p_limit: 200 })
  if (error) throw error
  type Row = { id: string; user_id: string; kind: string; title: string; body: string; url: string; attempts: number; created_at: string }
  const list = (rows ?? []) as Row[]
  if (!list.length) return { sent: 0 }
  const users = [...new Set(list.map((r) => r.user_id))]
  const { data: subs, error: e2 } = await admin.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth').in('user_id', users)
  if (e2) throw e2
  let sent = 0
  for (const r of list) {
    if (Date.now() - new Date(r.created_at).getTime() > MAX_AGE_MS) {
      await admin.from('notification_log').update({ attempts: 3, result: 'vencido' }).eq('id', r.id)
      continue
    }
    const mine = (subs ?? []).filter((s) => s.user_id === r.user_id) as Sub[]
    if (!mine.length) {
      // Sin celular con notificaciones: queda registrado, no se reintenta
      await admin.from('notification_log').update({ sent_at: new Date().toISOString(), result: 'sin_celular' }).eq('id', r.id)
      continue
    }
    const payload = JSON.stringify({ title: r.title, body: r.body, url: r.url, tag: r.kind === 'cambio' ? `cambio-${r.id}` : r.kind })
    let ok = 0
    let lastError = ''
    for (const s of mine) {
      const res = await sendTo(s, payload)
      if (res === true) ok++
      else lastError = res
    }
    await admin
      .from('notification_log')
      .update(ok ? { sent_at: new Date().toISOString(), result: `ok ${ok}/${mine.length}` } : { attempts: r.attempts + 1, result: `fallo ${lastError}` })
      .eq('id', r.id)
    if (ok) sent++
  }
  return { sent, total: list.length }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  // Tarea programada / avisos al instante: autenticada con el secreto de Vault
  const cronHeader = req.headers.get('x-cron-secret')
  if (cronHeader) {
    const { data: secret } = await admin.rpc('get_cron_secret')
    if (!secret || cronHeader !== secret) return json({ error: 'No autorizado' }, 401)
    try {
      const keys = await getVapidKeys()
      webpush.setVapidDetails(VAPID_SUBJECT, keys.publicKey, keys.privateKey)
      return json({ ok: true, ...(await sendQueued()) })
    } catch (e) {
      console.error(e)
      return json({ error: 'Error interno' }, 500)
    }
  }

  // Verifica la sesión del usuario a partir de su token
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: userData } = await admin.auth.getUser(token)
  const user = userData?.user
  if (!user) return json({ error: 'Debes iniciar sesión' }, 401)

  const { action } = await req.json().catch(() => ({ action: '' }))

  try {
    const keys = await getVapidKeys()
    if (action === 'public-key') return json({ publicKey: keys.publicKey })

    if (action === 'test') {
      webpush.setVapidDetails(VAPID_SUBJECT, keys.publicKey, keys.privateKey)
      const { data: subs, error } = await admin
        .from('push_subscriptions')
        .select('id, user_id, endpoint, p256dh, auth')
        .eq('user_id', user.id)
      if (error) throw error
      if (!subs?.length) return json({ error: 'Este usuario no tiene celulares con notificaciones activas' }, 400)

      const payload = JSON.stringify({
        title: '¡Funciona! 🎉',
        body: 'Así te avisaremos cuando te toque limpiar.',
        url: './#/hoy',
      })
      let sent = 0
      for (const s of subs as Sub[]) if ((await sendTo(s, payload)) === true) sent++
      return json({ sent, total: subs.length })
    }
    return json({ error: 'Acción desconocida' }, 400)
  } catch (e) {
    console.error(e)
    return json({ error: 'Error interno' }, 500)
  }
})
