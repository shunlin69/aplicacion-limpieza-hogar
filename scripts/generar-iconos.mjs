// Genera los íconos PNG de la app a partir de public/favicon.svg
// Uso: node scripts/generar-iconos.mjs  (requiere Playwright/Chromium)
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')

const svg = readFileSync('public/favicon.svg', 'utf8')
const browser = await chromium.launch()
const page = await browser.newPage()

async function render(size, out, { padding = 0, bg = 'transparent', square = false } = {}) {
  const inner = square ? svg.replace(/rx="120"/, 'rx="0"') : svg
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<html><body style="margin:0;background:${bg};display:grid;place-items:center;width:${size}px;height:${size}px">
     <div style="width:${size - padding * 2}px;height:${size - padding * 2}px">${inner.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body></html>`,
  )
  await page.screenshot({ path: out, omitBackground: bg === 'transparent' })
}

await render(192, 'public/icons/icon-192.png')
await render(512, 'public/icons/icon-512.png')
// iOS recorta las esquinas solo: icono cuadrado sin transparencia
await render(180, 'public/icons/apple-touch-icon.png', { square: true })
// Android "maskable": el dibujo debe caber en el 80% central
await render(512, 'public/icons/icon-maskable-512.png', { square: true })
// Insignia monocroma para la barra de notificaciones de Android
await page.setViewportSize({ width: 96, height: 96 })
await page.setContent(`<html><body style="margin:0"><svg width="96" height="96" viewBox="0 0 512 512"><path d="M256 60 L470 246 L420 246 L420 452 L92 452 L92 246 L42 246 Z" fill="#fff"/></svg></body></html>`)
await page.screenshot({ path: 'public/icons/badge-96.png', omitBackground: true })
await browser.close()
console.log('Íconos generados')
