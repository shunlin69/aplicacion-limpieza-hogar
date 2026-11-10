// Ilustraciones planas de cada espacio de la casa (SVG dibujado a mano).
// Los colores salen de las variables del tema, así se ven bien en claro y oscuro.
import type { SnapshotSpace } from '../hooks/useWeek'

export type EscenaTipo = 'cocina' | 'bano' | 'living' | 'comedor' | 'casa' | 'trofeo'

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Escena según el nombre de un espacio */
export function escenaDeEspacio(nombre: string): EscenaTipo {
  const n = sinTildes(nombre)
  if (n.includes('cocina')) return 'cocina'
  if (n.includes('bano')) return 'bano'
  if (n.includes('living') || n.includes('sala') || n.includes('estar')) return 'living'
  if (n.includes('comedor')) return 'comedor'
  return 'casa'
}

/** Escena de un turno: la del espacio que más trabajo da */
export function escenaDeTurno(spaces: Pick<SnapshotSpace, 'name' | 'difficulty' | 'minutes'>[]): EscenaTipo {
  const main = [...spaces].sort((a, b) => b.difficulty * b.minutes - a.difficulty * a.minutes)[0]
  return main ? escenaDeEspacio(main.name) : 'casa'
}

function Bano() {
  return (
    <>
      <rect className="f-sky" x="0" y="0" width="200" height="112" />
      <path className="ln-soft" d="M0 28H200M0 56H200M0 84H200M40 0V112M80 0V112M120 0V112M160 0V112" />
      <rect className="f-deep" x="0" y="112" width="200" height="28" />
      <circle className="f-cream ln" cx="34" cy="26" r="5" />
      <circle className="f-cream ln" cx="48" cy="14" r="3.5" />
      <circle className="f-cream ln" cx="170" cy="22" r="4" />
      <path className="ln" d="M152 66V42q0-10-10-10h-8" />
      <rect className="f-lemon ln" x="128" y="28" width="9" height="9" rx="3" />
      <circle className="f-cream ln" cx="58" cy="60" r="11" />
      <circle className="f-cream ln" cx="78" cy="55" r="13" />
      <circle className="f-cream ln" cx="100" cy="58" r="12" />
      <circle className="f-cream ln" cx="120" cy="60" r="10" />
      <circle className="f-cream ln" cx="138" cy="62" r="8" />
      <ellipse className="f-lemon ln" cx="96" cy="50" rx="13" ry="8" />
      <circle className="f-lemon ln" cx="105" cy="38" r="7" />
      <path className="f-peach" d="M111 38l7 2-7 3z" />
      <circle className="f-ink" cx="107" cy="36" r="1.4" />
      <rect className="f-cream ln" x="22" y="64" width="150" height="12" rx="6" />
      <path className="f-cream ln" d="M30 76h134v12a22 22 0 0 1-22 22H52a22 22 0 0 1-22-22z" />
      <path className="ln" d="M52 110l-4 8M142 110l4 8" />
    </>
  )
}

function Cocina() {
  return (
    <>
      <rect className="f-mint" x="0" y="0" width="200" height="94" />
      <path className="ln-soft" d="M0 24H200M0 48H200M0 72H200M25 0V94M75 0V94M125 0V94M175 0V94" />
      <rect className="f-deep ln" x="-2" y="94" width="204" height="10" rx="3" />
      <rect className="f-peach" x="0" y="104" width="200" height="36" />
      <path className="ln" d="M66 104v36M134 104v36M56 118h6M72 118h6M124 118h6M140 118h6" />
      <path className="ln" d="M128 16H192" />
      <path className="ln" d="M140 16v26" />
      <ellipse className="f-lemon ln" cx="140" cy="48" rx="6" ry="8" />
      <path className="ln" d="M160 16v24" />
      <rect className="f-pink ln" x="153" y="40" width="14" height="14" rx="3" />
      <path className="ln" d="M180 16v20" />
      <path className="f-cream ln" d="M180 36c-7 0-8 14 0 18c8-4 7-18 0-18z" />
      <path className="ln" d="M60 34c-6-6 6-10 0-16M76 30c-6-6 6-10 0-16M92 34c-6-6 6-10 0-16" />
      <rect className="f-pink ln" x="42" y="54" width="68" height="40" rx="8" />
      <rect className="f-pink ln" x="38" y="46" width="76" height="10" rx="5" />
      <circle className="f-cream ln" cx="76" cy="42" r="4" />
      <path className="ln" d="M42 66h-8M110 66h8" />
      <path className="ln-cream" d="M52 70h22" />
      <path className="ln" d="M20 30l3-7 3 7-7-3 8 0z" />
    </>
  )
}

function Living() {
  return (
    <>
      <rect className="f-lav" x="0" y="0" width="200" height="108" />
      <rect className="f-deep" x="0" y="108" width="200" height="32" />
      <ellipse className="f-pink" cx="100" cy="122" rx="78" ry="10" />
      <rect className="f-cream ln" x="74" y="14" width="52" height="34" rx="4" />
      <path className="f-mint" d="M78 44l14-16 10 10 8-8 12 14z" />
      <circle className="f-lemon" cx="114" cy="24" r="4" />
      <path className="ln" d="M18 112V40" />
      <path className="f-lemon ln" d="M8 40h20l-5-16h-10z" />
      <rect className="f-sky ln" x="40" y="56" width="120" height="36" rx="12" />
      <rect className="f-peach ln" x="54" y="62" width="40" height="24" rx="8" />
      <rect className="f-pink ln" x="104" y="62" width="40" height="24" rx="8" />
      <rect className="f-sky ln" x="34" y="84" width="132" height="22" rx="10" />
      <rect className="f-sky ln" x="26" y="70" width="18" height="38" rx="9" />
      <rect className="f-sky ln" x="156" y="70" width="18" height="38" rx="9" />
      <path className="ln" d="M44 108v8M156 108v8" />
      <path className="f-mint ln" d="M184 78c-10-6-14-18-6-26c4 10 8 16 6 26z" />
      <path className="f-mint ln" d="M184 78c8-8 18-10 14-22c-8 6-14 12-14 22z" />
      <path className="f-peach ln" d="M174 80h20l-3 28h-14z" />
    </>
  )
}

function Comedor() {
  return (
    <>
      <rect className="f-peach" x="0" y="0" width="200" height="104" />
      <path className="ln-soft" d="M0 70H200" />
      <rect className="f-deep" x="0" y="104" width="200" height="36" />
      <path className="ln" d="M100 0v22" />
      <path className="f-lemon ln" d="M80 36a20 14 0 0 1 40 0z" />
      <circle className="f-lemon" cx="100" cy="40" r="4" />
      <rect className="f-cream ln" x="16" y="18" width="34" height="34" rx="17" />
      <path className="ln" d="M33 26v9l6 4" />
      <ellipse className="f-cream ln" cx="58" cy="74" rx="16" ry="4" />
      <ellipse className="f-cream ln" cx="142" cy="74" rx="16" ry="4" />
      <path className="f-sky ln" d="M84 70h32a16 12 0 0 1-32 0z" />
      <circle className="f-pink ln" cx="94" cy="64" r="6" />
      <circle className="f-lemon ln" cx="106" cy="63" r="6" />
      <circle className="f-mint ln" cx="100" cy="58" r="5" />
      <path className="f-cream ln" d="M170 58h8l-1 16h-6z" />
      <rect className="f-brown ln" x="22" y="78" width="156" height="10" rx="5" />
      <path className="ln" d="M36 88v28M164 88v28" />
    </>
  )
}

function Casa() {
  return (
    <>
      <rect className="f-lav" x="0" y="0" width="200" height="110" />
      <rect className="f-deep" x="0" y="110" width="200" height="30" />
      <path className="f-peach ln" d="M60 66l40-32 40 32v44H60z" />
      <path className="f-pink ln" d="M52 70l48-40 48 40" />
      <rect className="f-cream ln" x="90" y="82" width="20" height="28" rx="3" />
      <rect className="f-sky ln" x="70" y="72" width="14" height="14" rx="2" />
      <rect className="f-sky ln" x="116" y="72" width="14" height="14" rx="2" />
      <path className="f-lemon" d="M30 30l3 8 8 3-8 3-3 8-3-8-8-3 8-3zM170 24l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" />
    </>
  )
}

function Trofeo() {
  return (
    <>
      <circle className="f-lemon" cx="100" cy="66" r="58" opacity="0.5" />
      <path className="f-lemon ln" d="M68 26h64v20a32 32 0 0 1-64 0z" />
      <path className="ln" d="M68 34H54a14 14 0 0 0 14 22M132 34h14a14 14 0 0 1-14 22" />
      <path className="f-lemon ln" d="M92 76h16l4 16H88z" />
      <rect className="f-brown ln" x="76" y="92" width="48" height="14" rx="4" />
      <path className="f-cream" d="M100 34l4 8 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1z" />
      <path className="f-peach" d="M34 30l3 8 8 3-8 3-3 8-3-8-8-3 8-3zM166 40l2 6 6 2-6 2-2 6-2-6-6-2 6-2zM156 96l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
    </>
  )
}

const SCENES: Record<EscenaTipo, () => React.ReactElement> = {
  bano: Bano, cocina: Cocina, living: Living, comedor: Comedor, casa: Casa, trofeo: Trofeo,
}

export function Escena({ tipo, className = '' }: { tipo: EscenaTipo; className?: string }) {
  const Scene = SCENES[tipo]
  return (
    <svg className={`esc ${className}`} viewBox="0 0 200 140" preserveAspectRatio="xMidYMid slice" aria-hidden focusable="false">
      <Scene />
    </svg>
  )
}
