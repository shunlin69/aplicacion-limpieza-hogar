// Espacios, ítems de "limpio" y turnos del hogar, con actualización en tiempo real
import { useCallback, useEffect, useState } from 'react'
import type { IsoWeekday, LocalDate } from '../core/dates'
import type { Recurrence } from '../core/recurrence'
import { supabase } from '../lib/supabase'

export interface Space {
  id: string
  household_id: string
  name: string
  icon: string
  difficulty: number
  minutes: number
  sort_order: number
}

export interface ChecklistItem {
  id: string
  space_id: string
  label: string
  sort_order: number
}

export interface ShiftTemplate {
  id: string
  name: string
  recurrence: 'weekly' | 'every_n_days'
  weekdays: IsoWeekday[]
  interval_days: number | null
  anchor_date: LocalDate | null
  sort_order: number
  spaceIds: string[]
}

export const templateRule = (t: ShiftTemplate): Recurrence =>
  t.recurrence === 'weekly'
    ? { kind: 'weekly', weekdays: t.weekdays }
    : { kind: 'every_n_days', intervalDays: t.interval_days ?? 1, anchor: t.anchor_date ?? '2026-01-05' }

export function useCatalog(householdId: string | undefined) {
  const [spaces, setSpaces] = useState<Space[]>([])
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [templates, setTemplates] = useState<ShiftTemplate[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!householdId) return
    const [s, i, t, ts] = await Promise.all([
      supabase.from('spaces').select('id, household_id, name, icon, difficulty, minutes, sort_order').eq('household_id', householdId).eq('active', true).order('sort_order'),
      supabase.from('space_checklist_items').select('id, space_id, label, sort_order').eq('household_id', householdId).eq('active', true).order('sort_order'),
      supabase.from('shift_templates').select('id, name, recurrence, weekdays, interval_days, anchor_date, sort_order').eq('household_id', householdId).eq('active', true).order('sort_order'),
      supabase.from('shift_template_spaces').select('shift_template_id, space_id').eq('household_id', householdId),
    ])
    setSpaces((s.data as Space[]) ?? [])
    setItems((i.data as ChecklistItem[]) ?? [])
    const links = (ts.data ?? []) as { shift_template_id: string; space_id: string }[]
    setTemplates(
      ((t.data ?? []) as Omit<ShiftTemplate, 'spaceIds'>[]).map((tpl) => ({
        ...tpl,
        spaceIds: links.filter((l) => l.shift_template_id === tpl.id).map((l) => l.space_id),
      })),
    )
    setLoading(false)
  }, [householdId])

  useEffect(() => {
    void load()
    if (!householdId) return
    const filter = `household_id=eq.${householdId}`
    const ch = supabase.channel(`catalogo-${householdId}-${crypto.randomUUID()}`)
    for (const table of ['spaces', 'space_checklist_items', 'shift_templates', 'shift_template_spaces']) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table, filter }, () => void load())
    }
    ch.subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [householdId, load])

  return { spaces, items, templates, loading, reload: load }
}
