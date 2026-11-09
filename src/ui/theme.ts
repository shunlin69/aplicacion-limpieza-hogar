// Preferencia de tema: sistema, claro u oscuro (se guarda en este celular)
export type ThemePref = 'system' | 'light' | 'dark'
const KEY = 'casa-limpia:tema'

export function loadThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    /* almacenamiento bloqueado: usamos el del sistema */
  }
  return 'system'
}

export function applyThemePref(pref: ThemePref) {
  const root = document.documentElement
  if (pref === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', pref)
  try {
    localStorage.setItem(KEY, pref)
  } catch {
    /* sin almacenamiento: el tema dura hasta cerrar la app */
  }
}

/** Colores pastel para el perfil de cada integrante */
export const PROFILE_COLORS = ['#C9B8FF', '#FFC6DD', '#B5E8D3', '#FFD8B8', '#BFE0FF', '#FFF0A8', '#F7B8B8', '#D6F0B0']
export const PROFILE_AVATARS = ['🧽', '🦄', '🐱', '🐶', '🦊', '🐼', '🐸', '🦖', '🌸', '⚡', '🎧', '🍕', '🚀', '👑', '🌈', '🔥']
