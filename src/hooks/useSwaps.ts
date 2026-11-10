// Solicitudes de cambio de turno del hogar (en vivo)
import { useCallback, useEffect, useState } from 'react'
import type { LocalDate } from '../core/dates'
import { supabase, type Household } from '../lib/supabase'

export type SwapStatus = 'pending_target' | 'pending_admin' | 'approved' | 'rejected' | 'cancelled' | 'expired'

export interface Swap {
  id: string
  shiftId: string
  shiftDate: LocalDate
  requesterId: string
  targetId: string
  targetShiftId: string | null
  targetShiftDate: LocalDate | null
  note: string | null
  status: SwapStatus
  createdAt: string
}

export const isOpen = (s: Swap) => s.status === 'pending_target' || s.status === 'pending_admin'

export function useSwaps(household: Household | null) {
  const [swaps, setSwaps] = useState<Swap[]>([])

  const load = useCallback(async () => {
    if (!household) return
    const { data } = await supabase
      .from('swap_requests')
      .select('id, shift_id, requester_member_id, target_member_id, target_shift_id, note, status, created_at, shift:shifts!swap_requests_shift_id_fkey(date), target_shift:shifts!swap_requests_target_shift_id_fkey(date)')
      .eq('household_id', household.id)
      .order('created_at', { ascending: false })
      .limit(30)
    type Row = { id: string; shift_id: string; requester_member_id: string; target_member_id: string; target_shift_id: string | null; note: string | null; status: SwapStatus; created_at: string; shift: { date: string } | null; target_shift: { date: string } | null }
    setSwaps(((data ?? []) as unknown as Row[]).map((r) => ({
      id: r.id, shiftId: r.shift_id, shiftDate: r.shift?.date ?? '', requesterId: r.requester_member_id, targetId: r.target_member_id,
      targetShiftId: r.target_shift_id, targetShiftDate: r.target_shift?.date ?? null, note: r.note, status: r.status, createdAt: r.created_at,
    })))
  }, [household])

  useEffect(() => {
    void load()
    if (!household) return
    const ch = supabase.channel(`cambios-${household.id}-${crypto.randomUUID()}`)
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'swap_requests', filter: `household_id=eq.${household.id}` }, () => void load())
    ch.subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [household, load])

  return { swaps, reload: load }
}
