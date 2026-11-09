// Valores públicos del proyecto Supabase. La "publishable key" está hecha
// para ir en el celular: la seguridad real la ponen las políticas RLS.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://nyvzbctefxlomrzteagz.supabase.co'
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY ?? 'sb_publishable_AUp6-AwmbM2VjTwshcfj8Q_vB6Y0gXo'

/** Dirección base de la app (cambia entre local y GitHub Pages) */
export const appBaseUrl = () => new URL(import.meta.env.BASE_URL, window.location.origin).href
