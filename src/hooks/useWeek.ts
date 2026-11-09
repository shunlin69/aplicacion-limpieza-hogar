// Turnos de una semana. Si la semana aún no se reparte en el servidor,
// se muestra una PROYECCIÓN calculada con el mismo algoritmo.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { addDays, type LocalDate } from '../core/dates'
import { shiftPoints, shiftWeight, type SpaceEffort } from '../core/effort'
import { planWeek, type AssignmentReason, type OpenDebt } from '../core/rotation'
import { supabase, type Household, type Member } from '../lib/supabase'
import { templateRule, useCatalog } from './useCatalog'

export interface SnapshotSpace extends SpaceEffort {
  id: string
  name: string
  icon: string
  items?: { id: string; label: string }[]
}

export interface WeekShift {
  id: string | null // null = proyección
  templateId: string
  templateName: string
  date: LocalDate
  memberId: string | null
  originalMemberId: string | null
  reason: AssignmentReason | 'intercambio' | 'manual'
  status: 'pending' | 'done' | 'late_done' | 'missed'
  points: number
  spaces: SnapshotSpace[]
}

export interface Debt {
  id: string
  debtorId: string
  creditorId: string
  originWeek: LocalDate
  settledWeek: LocalDate | null
}

export interface Absence {
  id: string
  memberId: string
  weekStart: LocalDate
  reason: string | null
}

export function useWeek(household: Household | null, members: Member[], weekStart: LocalDate) {
  const catalog = useCatalog(household?.id)
  const [rows, setRows] = useState<WeekShift[] | null>(null)
  const [debts, setDebts] = useState<Debt[]>([])
  const [absences, setAbsences] = useState<Absence[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!household) return
    const [s, d, a] = await Promise.all([
      supabase.from('shifts').select('id, template_id, date, assigned_member_id, original_member_id, reason, status, points, snapshot').eq('household_id', household.id).eq('week_start', weekStart).order('date'),
      supabase.from('rotation_debts').select('id, debtor_member_id, creditor_member_id, origin_week, settled_week').eq('household_id', household.id).order('created_at'),
      supabase.from('member_unavailability').select('id, member_id, week_start, reason').eq('household_id', household.id).gte('week_start', addDays(weekStart, -7 * 8)),
    ])
    const shifts = (s.data ?? []) as { id: string; template_id: string; date: string; assigned_member_id: string | null; original_member_id: string | null; reason: WeekShift['reason']; status: WeekShift['status']; points: number; snapshot: { spaces?: SnapshotSpace[] } }[]
    setRows(
      shifts.length
        ? shifts.map((r) => ({
            id: r.id, templateId: r.template_id, templateName: '', date: r.date, memberId: r.assigned_member_id,
            originalMemberId: r.original_member_id, reason: r.reason, status: r.status, points: r.points, spaces: r.snapshot.spaces ?? [],
          }))
        : null,
    )
    setDebts(((d.data ?? []) as { id: string; debtor_member_id: string; creditor_member_id: string; origin_week: string; settled_week: string | null }[]).map((x) => ({
      id: x.id, debtorId: x.debtor_member_id, creditorId: x.creditor_member_id, originWeek: x.origin_week, settledWeek: x.settled_week,
    })))
    setAbsences(((a.data ?? []) as { id: string; member_id: string; week_start: string; reason: string | null }[]).map((x) => ({ id: x.id, memberId: x.member_id, weekStart: x.week_start, reason: x.reason })))
    setLoading(false)
  }, [household, weekStart])

  useEffect(() => {
    setLoading(true)
    void load()
    if (!household) return
    const filter = `household_id=eq.${household.id}`
    const ch = supabase.channel(`semana-${household.id}-${weekStart}-${crypto.randomUUID()}`)
    for (const table of ['shifts', 'rotation_debts', 'member_unavailability']) ch.on('postgres_changes', { event: '*', schema: 'public', table, filter }, () => void load())
    ch.subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [household, weekStart, load])

  // Proyección local cuando la semana aún no existe en el servidor
  const projection = useMemo<WeekShift[] | null>(() => {
    if (rows || !household?.rotation_start || weekStart < household.rotation_start || catalog.loading) return null
    const participants = members.filter((m) => m.participates && m.rotation_order !== null).map((m) => ({ memberId: m.id, order: m.rotation_order! }))
    const spacesOf = (spaceIds: string[]) => catalog.spaces.filter((s) => spaceIds.includes(s.id))
    const templates = catalog.templates.filter((t) => t.spaceIds.length).map((t) => ({
      templateId: t.id, rule: templateRule(t), weight: shiftWeight(spacesOf(t.spaceIds)), sortOrder: t.sort_order,
    }))
    const open: OpenDebt[] = debts.filter((d) => !d.settledWeek && d.originWeek < weekStart).map((d) => ({ id: d.id, debtorId: d.debtorId, creditorId: d.creditorId }))
    const plan = planWeek({
      weekStart, rotationStart: household.rotation_start, participants, templates,
      unavailable: new Set(absences.filter((a) => a.weekStart === weekStart).map((a) => a.memberId)), openDebts: open,
    })
    return plan.assignments.map((a) => {
      const tpl = catalog.templates.find((t) => t.id === a.templateId)!
      const sp = spacesOf(tpl.spaceIds)
      return {
        id: null, templateId: a.templateId, templateName: tpl.name, date: a.date, memberId: a.memberId, originalMemberId: a.originalMemberId,
        reason: a.reason, status: 'pending' as const, points: shiftPoints(sp), spaces: sp.map((s) => ({ id: s.id, name: s.name, icon: s.icon, difficulty: s.difficulty, minutes: s.minutes })),
      }
    })
  }, [rows, household, weekStart, members, catalog, debts, absences])

  const shifts = useMemo(() => {
    const list = rows ?? projection ?? []
    return list.map((s) => ({ ...s, templateName: s.templateName || catalog.templates.find((t) => t.id === s.templateId)?.name || 'Turno' }))
  }, [rows, projection, catalog.templates])

  return { shifts, isProjection: !rows && !!projection, debts, absences, loading: loading || catalog.loading, reload: load }
}
