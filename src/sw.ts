/// <reference lib="webworker" />
// Service worker: deja la app disponible sin conexión y recibe las
// notificaciones push aunque la app esté cerrada.
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> }

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

interface PushPayload {
  title?: string
  body?: string
  url?: string
  tag?: string
}

self.addEventListener('push', (event) => {
  let data: PushPayload = {}
  try {
    data = event.data?.json() ?? {}
  } catch {
    data = { body: event.data?.text() }
  }
  const scope = self.registration.scope
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Casa Limpia', {
      body: data.body ?? '',
      icon: scope + 'icons/icon-192.png',
      badge: scope + 'icons/badge-96.png',
      tag: data.tag,
      data: { url: new URL(data.url ?? './', scope).href },
    }),
  )
})

// Al tocar la notificación: enfoca la app si ya está abierta o la abre
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url: string = event.notification.data?.url ?? self.registration.scope
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const w of windows) {
        if ('focus' in w) {
          await (w as WindowClient).navigate(url).catch(() => undefined)
          return (w as WindowClient).focus()
        }
      }
      return self.clients.openWindow(url)
    })(),
  )
})
