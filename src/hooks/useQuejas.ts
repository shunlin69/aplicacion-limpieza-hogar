// Quejas del hogar con sus fotos de evidencia (en vivo)
import { useCallback, useEffect, useState } from 'react'
import type { LocalDate } from '../core/dates'
import type { ComplaintStatus } from '../core/quejas'
import type { ShiftPhoto } from '../lib/fotos'
import { supabase } from '../lib/supabase'

export interface Queja {
  id: string
  shiftId: string // turno reclamado
  shiftDate: LocalDate
  accusedId: string // quien hizo ese turno
  complainantId: string // quien reclamó
  complainantShiftId: string | null
  reason: string
  points: number // puntos restados
  status: ComplaintStatus
  response: string | null
  decidedBy: string | null
  createdAt: string
  photos: ShiftPhoto[]
}

export function useQuejas(householdId: string | undefined) {
  const [quejas, setQuejas] = useState<Queja[]>([])

  const load = useCallback(async () => {
    if (!householdId) return
    const { data } = await supabase
      .from('complaints')
      .select('id, shift_id, accused_member_id, complainant_member_id, complainant_shift_id, reason, points, status, response, decided_by, created_at, shift:shifts!complaints_shift_id_fkey(date)')
      .eq('household_id', householdId)
      .order('created_at', { ascending: false })
      .limit(60)
    type Row = {
      id: string; shift_id: string; accused_member_id: string; complainant_member_id: string; complainant_shift_id: string | null
      reason: string; points: number; status: ComplaintStatus; response: string | null; decided_by: string | null; created_at: string
      shift: { date: string } | null
    }
    const rows = (data ?? []) as unknown as Row[]
    const ids = rows.map((r) => r.id)
    const p = ids.length
      ? await supabase.from('complaint_photos').select('id, complaint_id, path, uploaded_by, created_at').in('complaint_id', ids).order('created_at')
      : { data: [] }
    const photos: Record<string, ShiftPhoto[]> = {}
    for (const x of (p.data ?? []) as { id: string; complaint_id: string; path: string; uploaded_by: string | null; created_at: string }[]) {
      const q = rows.find((r) => r.id === x.complaint_id)
      ;(photos[x.complaint_id] ??= []).push({ id: x.id, shiftId: q?.shift_id ?? '', path: x.path, uploadedBy: x.uploaded_by, createdAt: x.created_at })
    }
    setQuejas(rows.map((r) => ({
      id: r.id, shiftId: r.shift_id, shiftDate: r.shift?.date ?? '', accusedId: r.accused_member_id, complainantId: r.complainant_member_id,
      complainantShiftId: r.complainant_shift_id, reason: r.reason, points: r.points, status: r.status, response: r.response,
      decidedBy: r.decided_by, createdAt: r.created_at, photos: photos[r.id] ?? [],
    })))
  }, [householdId])

  useEffect(() => {
    void load()
    if (!householdId) return
    const filter = `household_id=eq.${householdId}`
    const ch = supabase.channel(`quejas-${householdId}-${crypto.randomUUID()}`)
    for (const table of ['complaints', 'complaint_photos']) ch.on('postgres_changes', { event: '*', schema: 'public', table, filter }, () => void load())
    ch.subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [householdId, load])

  return { quejas, reload: load }
}
