import { supabase } from './supabase'
import { base64UrlToBytes } from '../core/base64'

export type PushState = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on'

async function registration() {
  const reg = await navigator.serviceWorker.getRegistration()
  if (reg) return reg
  return navigator.serviceWorker.ready
}

export async function currentSubscription() {
  if (!('serviceWorker' in navigator)) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

/**
 * ¿Este celular recibe avisos? Debe tener suscripción Y estar registrada en el
 * servidor (el servidor borra las que Apple/Google dan por vencidas).
 */
export async function pushActiveHere(): Promise<boolean> {
  const sub = await currentSubscription()
  if (!sub) return false
  const { data } = await supabase.from('push_subscriptions').select('id').eq('endpoint', sub.endpoint).limit(1)
  return !!data?.length
}

/**
 * Pide permiso y registra este celular para recibir notificaciones.
 * Debe llamarse desde un toque del usuario (iPhone lo exige).
 */
export async function enablePush(userId: string): Promise<void> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('No diste permiso para notificaciones')

  const { data, error } = await supabase.functions.invoke<{ publicKey: string }>('push', {
    body: { action: 'public-key' },
  })
  if (error || !data?.publicKey) throw new Error('No se pudo obtener la clave de notificaciones')

  const reg = await registration()
  let sub = await reg.pushManager.getSubscription()
  // Si el servidor ya no la tiene (vencida), se crea una nueva
  if (sub && !(await pushActiveHere())) {
    await sub.unsubscribe().catch(() => undefined)
    sub = null
  }
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(data.publicKey) as BufferSource,
    })
  }
  const json = sub.toJSON()
  const { error: dbError } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
      user_agent: navigator.userAgent.slice(0, 200),
    },
    { onConflict: 'endpoint' },
  )
  if (dbError) throw dbError
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

export async function sendTestPush(): Promise<number> {
  const { data, error } = await supabase.functions.invoke<{ sent: number; error?: string }>('push', {
    body: { action: 'test' },
  })
  if (error) {
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null)
    throw new Error(body?.error ?? 'No se pudo enviar la prueba')
  }
  return data?.sent ?? 0
}
