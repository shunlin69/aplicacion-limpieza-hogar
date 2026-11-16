// Fotos de respaldo de los turnos: se achican en el celular antes de subir
// (así suben rápido y no llenan el almacenamiento) y se guardan en un
// bucket privado. Para verlas se piden enlaces firmados que duran 1 hora.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

export const BUCKET = 'fotos-turnos'
export const MAX_FOTOS = 4
const MAX_LADO = 1600 // píxeles del lado más largo
const CALIDAD = 0.8

export interface ShiftPhoto {
  id: string
  shiftId: string
  path: string
  uploadedBy: string | null
  createdAt: string
}

/** Tamaño final manteniendo la proporción (nunca agranda) */
export function fitSize(w: number, h: number, max = MAX_LADO): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(w, h))
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) }
}

/** Ruta del archivo en el bucket: <hogar>/<turno>/<id>.jpg */
export const photoPath = (householdId: string, shiftId: string, id: string) => `${householdId}/${shiftId}/${id}.jpg`

/** Achica y pasa a JPEG. Usa <img> porque Safari así entiende HEIC y respeta la rotación. */
export async function compressImage(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const { w, h } = fitSize(img.naturalWidth, img.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No se pudo preparar la foto')
    ctx.drawImage(img, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', CALIDAD))
    if (!blob) throw new Error('No se pudo preparar la foto')
    return blob
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('No se pudo')) throw e
    throw new Error('Esa imagen no se pudo abrir. Prueba con otra foto')
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Sube una foto a un turno y la registra */
export async function uploadShiftPhoto(householdId: string, shiftId: string, file: File): Promise<void> {
  const blob = await compressImage(file)
  const path = photoPath(householdId, shiftId, crypto.randomUUID())
  const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  if (up.error) throw up.error
  const { error } = await supabase.rpc('add_shift_photo', { p_shift: shiftId, p_path: path })
  if (error) {
    // Si no se pudo registrar, no deja el archivo suelto
    await supabase.functions.invoke('fotos', { body: { action: 'discard', path } }).catch(() => undefined)
    throw error
  }
}

/** Quita una foto (registro y archivo). Lo hace el servidor tras revisar el permiso. */
export async function removeShiftPhoto(photoId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>('fotos', { body: { action: 'remove', id: photoId } })
  if (error) {
    // El mensaje del servidor viene en el cuerpo de la respuesta
    const ctx = (error as { context?: Response }).context
    const msg = ctx ? await ctx.json().then((j: { error?: string }) => j.error).catch(() => undefined) : undefined
    throw new Error(msg ?? error.message)
  }
  if (data?.error) throw new Error(data.error)
}

// Enlaces firmados en memoria para no pedirlos cada vez
const urlCache = new Map<string, { url: string; until: number }>()

export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  const now = Date.now()
  const out: Record<string, string> = {}
  const missing: string[] = []
  for (const p of paths) {
    const c = urlCache.get(p)
    if (c && c.until > now) out[p] = c.url
    else missing.push(p)
  }
  if (missing.length) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(missing, 3600)
    for (const d of data ?? []) {
      if (!d.signedUrl || !d.path) continue
      out[d.path] = d.signedUrl
      urlCache.set(d.path, { url: d.signedUrl, until: now + 50 * 60_000 })
    }
  }
  return out
}

/** Fotos de varios turnos, al día en tiempo real */
export function useShiftPhotos(householdId: string | undefined, shiftIds: string[]) {
  const [photos, setPhotos] = useState<Record<string, ShiftPhoto[]>>({})
  const key = [...shiftIds].sort().join(',')

  const load = useCallback(async () => {
    const ids = key ? key.split(',') : []
    if (!householdId || !ids.length) {
      setPhotos({})
      return
    }
    const { data } = await supabase
      .from('shift_photos')
      .select('id, shift_id, path, uploaded_by, created_at')
      .in('shift_id', ids)
      .order('created_at')
    const map: Record<string, ShiftPhoto[]> = {}
    for (const r of (data ?? []) as { id: string; shift_id: string; path: string; uploaded_by: string | null; created_at: string }[]) {
      ;(map[r.shift_id] ??= []).push({ id: r.id, shiftId: r.shift_id, path: r.path, uploadedBy: r.uploaded_by, createdAt: r.created_at })
    }
    setPhotos(map)
  }, [householdId, key])

  useEffect(() => {
    void load()
    if (!householdId || !key) return
    const ch = supabase
      .channel(`fotos-${householdId}-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_photos', filter: `household_id=eq.${householdId}` }, () => void load())
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [householdId, key, load])

  return { photos, reload: load }
}
