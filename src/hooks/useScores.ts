// Puntos, resultados de turnos, premios e historial del hogar (en vivo)
import { useCallback, useEffect, useState } from 'react'
import type { ShiftStatus } from '../core/completion'
import { localDateOf, type LocalDate } from '../core/dates'
import type { LedgerEntry, Reward, ShiftResult } from '../core/ranking'
import { supabase, type Household } from '../lib/supabase'

export interface Activity {
  id: string
  actorUserId: string | null
  verb: string
  payload: Record<string, unknown>
  createdAt: string
}

export function useScores(household: Household | null) {
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [results, setResults] = useState<ShiftResult[]>([])
  const [rewards, setRewards] = useState<Reward[]>([])
  const [activity, setActivity] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!household) return
    const tz = household.timezone
    const [l, s, r, a] = await Promise.all([
      supabase.from('points_ledger').select('member_id, delta, created_at, shift:shifts(date)').eq('household_id', household.id),
      supabase.from('shifts').select('assigned_member_id, date, status').eq('household_id', household.id),
      supabase.from('rewards').select('id, name, icon, points_needed').eq('household_id', household.id).eq('active', true).order('points_needed'),
      supabase.from('activity_log').select('id, actor_user_id, verb, payload, created_at').eq('household_id', household.id).order('created_at', { ascending: false }).limit(60),
    ])
    type L = { member_id: string; delta: number; created_at: string; shift: { date: string } | null }
    setLedger(((l.data ?? []) as unknown as L[]).map((x) => ({
      memberId: x.member_id,
      delta: x.delta,
      // Cuenta en la fecha del turno; si no viene de un turno, en la fecha del registro
      date: x.shift?.date ?? localDateOf(new Date(x.created_at), tz),
    })))
    setResults(((s.data ?? []) as { assigned_member_id: string | null; date: LocalDate; status: ShiftStatus }[]).map((x) => ({ memberId: x.assigned_member_id, date: x.date, status: x.status })))
    setRewards(((r.data ?? []) as { id: string; name: string; icon: string; points_needed: number }[]).map((x) => ({ id: x.id, name: x.name, icon: x.icon, pointsNeeded: x.points_needed })))
    setActivity(((a.data ?? []) as { id: string; actor_user_id: string | null; verb: string; payload: Record<string, unknown>; created_at: string }[]).map((x) => ({
      id: x.id, actorUserId: x.actor_user_id, verb: x.verb, payload: x.payload, createdAt: x.created_at,
    })))
    setLoading(false)
  }, [household])

  useEffect(() => {
    void load()
    if (!household) return
    const filter = `household_id=eq.${household.id}`
    const ch = supabase.channel(`puntos-${household.id}-${crypto.randomUUID()}`)
    for (const table of ['points_ledger', 'shifts', 'rewards', 'activity_log']) ch.on('postgres_changes', { event: '*', schema: 'public', table, filter }, () => void load())
    ch.subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [household, load])

  return { ledger, results, rewards, activity, loading, reload: load }
}
