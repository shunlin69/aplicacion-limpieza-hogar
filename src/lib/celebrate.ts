// Sonido y confeti al terminar un turno. El sonido se genera con Web Audio
// (sin archivos) y solo suena tras un toque, como exige el iPhone.
let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function note(a: AudioContext, freq: number, start: number, dur: number, vol: number, type: OscillatorType = 'triangle') {
  const o = a.createOscillator()
  const g = a.createGain()
  o.type = type
  o.frequency.value = freq
  g.gain.setValueAtTime(0.0001, start)
  g.gain.exponentialRampToValueAtTime(vol, start + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  o.connect(g).connect(a.destination)
  o.start(start)
  o.stop(start + dur + 0.05)
}

/** "Tic" corto al marcar un ítem */
export function playTick() {
  const a = audio()
  if (a) note(a, 880, a.currentTime, 0.08, 0.08, 'sine')
}

/** Arpegio de "¡puntos!" al terminar el turno */
export function playPoints() {
  const a = audio()
  if (!a) return
  const t = a.currentTime
  ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(a, f, t + i * 0.09, 0.35, 0.18))
  note(a, 1567.98, t + 0.4, 0.6, 0.1, 'sine')
}

/** Lanza confeti de colores pastel sobre la pantalla */
export function confetti(count = 70) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const colors = ['#c9b8ff', '#ffc6dd', '#b5e8d3', '#ffd8b8', '#bfe0ff', '#fff0a8']
  const layer = document.createElement('div')
  layer.className = 'confetti'
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i')
    p.style.left = `${Math.random() * 100}%`
    p.style.background = colors[i % colors.length]
    p.style.animationDelay = `${Math.random() * 0.3}s`
    p.style.animationDuration = `${1.4 + Math.random() * 1.2}s`
    p.style.setProperty('--x', `${(Math.random() - 0.5) * 160}px`)
    p.style.setProperty('--r', `${Math.random() * 720 - 360}deg`)
    layer.appendChild(p)
  }
  document.body.appendChild(layer)
  setTimeout(() => layer.remove(), 3200)
}
