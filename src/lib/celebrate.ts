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

/** Fanfarria para el campeón del mes */
export function playFanfare() {
  const a = audio()
  if (!a) return
  const t = a.currentTime
  const seq: [number, number, number][] = [
    [392.0, 0, 0.18], [523.25, 0.16, 0.18], [659.25, 0.32, 0.18], [783.99, 0.48, 0.5],
    [659.25, 0.78, 0.14], [783.99, 0.92, 0.7],
  ]
  for (const [f, at, d] of seq) {
    note(a, f, t + at, d, 0.16, 'square')
    note(a, f / 2, t + at, d, 0.08, 'triangle')
  }
  note(a, 1567.98, t + 1.0, 0.9, 0.08, 'sine')
}

/** Lanza confeti de colores pastel sobre la pantalla */
export function confetti(count = 70) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const colors = ['#f6d6bd', '#f4d3d4', '#cfe5d3', '#dcd0ec', '#d4e5ee', '#f6e7b5', '#d6a477']
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
    // Mezcla de papelitos rectangulares y redondos
    if (i % 3 === 0) p.style.borderRadius = '50%'
    layer.appendChild(p)
  }
  document.body.appendChild(layer)
  setTimeout(() => layer.remove(), 3200)
}
