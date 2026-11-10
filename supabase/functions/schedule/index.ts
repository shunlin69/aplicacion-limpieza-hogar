// =============================================================
// Edge Function "schedule": reparte los turnos (la "autoridad neutral").
// Usa el mismo algoritmo probado de src/core/rotation.ts (copiado en ./core).
//
// Acciones:
//   { action: 'cron' }                         -> tarea programada (cada hora): asegura las semanas de todos los hogares
//   { action: 'ensure', householdId }          -> asegura semana actual (y la siguiente desde el domingo 18:00)
//   { action: 'draw', householdId, startDate } -> admin: sorteo del orden y fecha de inicio
//   { action: 'regenerate', householdId, weekStart } -> admin: recalcula una semana (ej: tras marcar ausencia)
// =============================================================
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.49.4'
import { addDays, isoWeekday, localDateOf, weekStart as weekStartOf, type IsoWeekday, type LocalDate } from './core/dates.ts'
import { shiftPoints, shiftWeight } from './core/effort.ts'
import { planWeek, shuffle, type OpenDebt, type TemplateForWeek } from './core/rotation.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

class UserError extends Error {}

const db: SupabaseClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

// Hora a partir de la cual se reparte la semana siguiente (domingo, hora local)
const NEXT_WEEK_HOUR = 18

async function q<T = unknown>(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await p
  if (error) throw error
  return data as T
}

interface Household {
  id: string
  timezone: string
  rotation_start: LocalDate | null
}

function nowLocal(tz: string) {
  const now = new Date()
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', hour: '2-digit' }).format(now))
  return { today: localDateOf(now, tz), hour }
}

/** Semanas que deben existir ya: la actual, y la siguiente desde el domingo 18:00 */
function weeksDue(h: Household): LocalDate[] {
  if (!h.rotation_start) return []
  const { today, hour } = nowLocal(h.timezone)
  const current = weekStartOf(today)
  const weeks = [current]
  if (isoWeekday(today) === 7 && hour >= NEXT_WEEK_HOUR) weeks.push(addDays(current, 7))
  return weeks.filter((w) => w >= h.rotation_start!)
}

async function loadContext(h: Household, week: LocalDate) {
  const members = await q<{ id: string; rotation_order: number | null; participates: boolean }[]>(
    db.from('household_members').select('id, rotation_order, participates').eq('household_id', h.id),
  )
  const participants = members
    .filter((m) => m.participates && m.rotation_order !== null)
    .map((m) => ({ memberId: m.id, order: m.rotation_order! }))

  const templates = await q<{ id: string; recurrence: string; weekdays: number[]; interval_days: number | null; anchor_date: string | null; sort_order: number }[]>(
    db.from('shift_templates').select('id, recurrence, weekdays, interval_days, anchor_date, sort_order').eq('household_id', h.id).eq('active', true),
  )
  const links = await q<{ shift_template_id: string; space_id: string }[]>(db.from('shift_template_spaces').select('shift_template_id, space_id').eq('household_id', h.id))
  const spaces = await q<{ id: string; name: string; icon: string; difficulty: number; minutes: number; sort_order: number }[]>(
    db.from('spaces').select('id, name, icon, difficulty, minutes, sort_order').eq('household_id', h.id).eq('active', true).order('sort_order'),
  )
  const items = await q<{ id: string; space_id: string; label: string }[]>(
    db.from('space_checklist_items').select('id, space_id, label').eq('household_id', h.id).eq('active', true).order('sort_order'),
  )

  // Copia fija de los espacios e ítems de cada turno (para el historial y la Fase 4)
  const tplSpaces = new Map<string, typeof spaces>()
  for (const t of templates) {
    tplSpaces.set(t.id, spaces.filter((s) => links.some((l) => l.shift_template_id === t.id && l.space_id === s.id)))
  }
  const forWeek: TemplateForWeek[] = templates
    .filter((t) => (tplSpaces.get(t.id)?.length ?? 0) > 0)
    .map((t) => ({
      templateId: t.id,
      rule: t.recurrence === 'weekly'
        ? { kind: 'weekly' as const, weekdays: t.weekdays as IsoWeekday[] }
        : { kind: 'every_n_days' as const, intervalDays: t.interval_days ?? 1, anchor: t.anchor_date ?? h.rotation_start! },
      weight: shiftWeight(tplSpaces.get(t.id)!),
      sortOrder: t.sort_order,
    }))
  const snapshotOf = (templateId: string) => ({
    spaces: (tplSpaces.get(templateId) ?? []).map((s) => ({
      id: s.id, name: s.name, icon: s.icon, difficulty: s.difficulty, minutes: s.minutes,
      items: items.filter((i) => i.space_id === s.id).map((i) => ({ id: i.id, label: i.label })),
    })),
  })
  const pointsOf = (templateId: string) => shiftPoints(tplSpaces.get(templateId) ?? [])

  const unavailable = new Set(
    (await q<{ member_id: string }[]>(db.from('member_unavailability').select('member_id').eq('household_id', h.id).eq('week_start', week))).map((u) => u.member_id),
  )

  // Carga histórica (solo desempata si hay más turnos que personas)
  const past = await q<{ assigned_member_id: string | null; weight: number }[]>(
    db.from('shifts').select('assigned_member_id, weight').eq('household_id', h.id).lt('week_start', week),
  )
  const loadHistory: Record<string, number> = {}
  for (const s of past) if (s.assigned_member_id) loadHistory[s.assigned_member_id] = (loadHistory[s.assigned_member_id] ?? 0) + s.weight

  return { participants, forWeek, snapshotOf, pointsOf, unavailable, loadHistory }
}

async function openDebtsBefore(householdId: string, week: LocalDate): Promise<OpenDebt[]> {
  const rows = await q<{ id: string; debtor_member_id: string; creditor_member_id: string }[]>(
    db.from('rotation_debts').select('id, debtor_member_id, creditor_member_id')
      .eq('household_id', householdId).is('settled_shift_id', null).lt('origin_week', week).order('created_at'),
  )
  return rows.map((r) => ({ id: r.id, debtorId: r.debtor_member_id, creditorId: r.creditor_member_id }))
}

/** Reparte una semana nueva. No hace nada si ya estaba repartida. */
async function generateWeek(h: Household, week: LocalDate) {
  const ctx = await loadContext(h, week)
  const plan = planWeek({
    weekStart: week, rotationStart: h.rotation_start!, participants: ctx.participants, templates: ctx.forWeek,
    unavailable: ctx.unavailable, openDebts: await openDebtsBefore(h.id, week), loadHistory: ctx.loadHistory,
  })
  // Marca la semana primero: si otra ejecución llegó antes, esta se detiene aquí
  const { error: lockErr } = await db.from('schedule_weeks').insert({ household_id: h.id, week_start: week, week_index: plan.weekIndex })
  if (lockErr) return { generated: false }

  const inserted = await q<{ id: string; template_id: string; date: string }[]>(
    db.from('shifts').insert(plan.assignments.map((a) => ({
      household_id: h.id, template_id: a.templateId, week_start: week, date: a.date,
      assigned_member_id: a.memberId, original_member_id: a.originalMemberId, reason: a.reason,
      weight: a.weight, points: ctx.pointsOf(a.templateId), snapshot: ctx.snapshotOf(a.templateId),
    }))).select('id, template_id, date'),
  )
  await applyDebts(h.id, week, plan, inserted)
  await db.from('activity_log').insert({ household_id: h.id, verb: 'semana_repartida', payload: { semana: week, numero: plan.weekIndex + 1 } })
  return { generated: true }
}

async function applyDebts(householdId: string, week: LocalDate, plan: ReturnType<typeof planWeek>, shifts: { id: string; template_id: string; date: string }[]) {
  const shiftId = (templateId: string, date: string) => shifts.find((s) => s.template_id === templateId && s.date === date)?.id ?? null
  if (plan.newDebts.length) {
    await q(db.from('rotation_debts').insert(plan.newDebts.map((d) => ({
      household_id: householdId, debtor_member_id: d.debtorId, creditor_member_id: d.creditorId,
      origin_shift_id: shiftId(d.templateId, d.date), origin_week: week,
    }))))
  }
  for (const s of plan.settledDebts) {
    await q(db.from('rotation_debts').update({ settled_shift_id: shiftId(s.templateId, s.date), settled_week: week }).eq('id', s.debtId))
  }
}

/**
 * Recalcula una semana ya repartida (ej: el admin marcó a alguien como no disponible).
 * Los turnos ya hechos, pasados o intercambiados no se tocan.
 */
async function regenerateWeek(h: Household, week: LocalDate) {
  const { today } = nowLocal(h.timezone)
  const existing = await q<{ id: string; template_id: string; date: string; status: string; reason: string }[]>(
    db.from('shifts').select('id, template_id, date, status, reason').eq('household_id', h.id).eq('week_start', week),
  )
  if (!existing.length) return generateWeek(h, week)

  // Deshace las deudas por ausencia que nacieron o se pagaron esta semana para volver a calcularlas
  // (las de intercambios aprobados se conservan)
  await q(db.from('rotation_debts').delete().eq('household_id', h.id).eq('origin_week', week).eq('source', 'ausencia'))
  await q(db.from('rotation_debts').update({ settled_shift_id: null, settled_week: null }).eq('household_id', h.id).eq('settled_week', week))

  const ctx = await loadContext(h, week)
  const plan = planWeek({
    weekStart: week, rotationStart: h.rotation_start!, participants: ctx.participants, templates: ctx.forWeek,
    unavailable: ctx.unavailable, openDebts: await openDebtsBefore(h.id, week), loadHistory: ctx.loadHistory,
  })
  const locked = (s: (typeof existing)[number]) => s.status !== 'pending' || s.date < today || s.reason === 'intercambio' || s.reason === 'manual'
  const all: { id: string; template_id: string; date: string }[] = []
  for (const a of plan.assignments) {
    const cur = existing.find((s) => s.template_id === a.templateId && s.date === a.date)
    if (cur && locked(cur)) {
      all.push(cur)
      continue
    }
    const row = { assigned_member_id: a.memberId, original_member_id: a.originalMemberId, reason: a.reason }
    if (cur) {
      await q(db.from('shifts').update(row).eq('id', cur.id))
      all.push(cur)
    } else {
      const ins = await q<{ id: string; template_id: string; date: string }[]>(db.from('shifts').insert({
        ...row, household_id: h.id, template_id: a.templateId, week_start: week, date: a.date,
        weight: a.weight, points: ctx.pointsOf(a.templateId), snapshot: ctx.snapshotOf(a.templateId),
      }).select('id, template_id, date'))
      all.push(...ins)
    }
  }
  // Solo deudas de turnos que sí se recalcularon
  const editable = (templateId: string, date: string) => {
    const cur = existing.find((s) => s.template_id === templateId && s.date === date)
    return !cur || !locked(cur)
  }
  await applyDebts(h.id, week, {
    ...plan,
    newDebts: plan.newDebts.filter((d) => editable(d.templateId, d.date)),
    settledDebts: plan.settledDebts.filter((d) => editable(d.templateId, d.date)),
  }, all)
  return { regenerated: true }
}

async function ensureHousehold(h: Household) {
  const results = []
  for (const w of weeksDue(h)) results.push({ week: w, ...(await generateWeek(h, w)) })
  return results
}

async function getHousehold(id: string): Promise<Household> {
  return await q<Household>(db.from('households').select('id, timezone, rotation_start').eq('id', id).single())
}

async function requireMember(userId: string, householdId: string, admin: boolean) {
  const rows = await q<{ role: string }[]>(db.from('household_members').select('role').eq('household_id', householdId).eq('user_id', userId))
  if (!rows.length) throw new UserError('No perteneces a este hogar')
  if (admin && rows[0].role !== 'admin') throw new UserError('Solo un administrador puede hacer esto')
}

/** Sorteo: orden al azar (criptográfico) y fecha de inicio */
async function draw(userId: string, householdId: string, startDate: LocalDate) {
  const h = await getHousehold(householdId)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || isoWeekday(startDate) !== 1) throw new UserError('La rotación debe partir un lunes')
  const { today } = nowLocal(h.timezone)
  const started = await q<{ id: string }[]>(db.from('shifts').select('id').eq('household_id', h.id).lt('date', today).limit(1))
  if (started.length) throw new UserError('La rotación ya comenzó; el orden ya no se puede volver a sortear')

  // Limpia lo repartido a futuro (aún no empieza) para recalcular con el nuevo orden
  await q(db.from('rotation_debts').delete().eq('household_id', h.id))
  await q(db.from('shifts').delete().eq('household_id', h.id))
  await q(db.from('schedule_weeks').delete().eq('household_id', h.id))

  const members = await q<{ id: string; participates: boolean; profile: { display_name: string } }[]>(
    db.from('household_members').select('id, participates, profile:profiles!household_members_user_id_profiles_fkey(display_name)').eq('household_id', h.id),
  )
  const random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32
  const order = shuffle(members.filter((m) => m.participates), random)
  await q(db.from('household_members').update({ rotation_order: null }).eq('household_id', h.id))
  for (const [i, m] of order.entries()) await q(db.from('household_members').update({ rotation_order: i }).eq('id', m.id))
  await q(db.from('households').update({ rotation_start: startDate }).eq('id', h.id))
  await q(db.from('activity_log').insert({
    household_id: h.id, actor_user_id: userId, verb: 'sorteo_rotacion',
    payload: { orden: order.map((m) => m.profile.display_name), inicio: startDate },
  }))
  return ensureHousehold({ ...h, rotation_start: startDate })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const body = await req.json().catch(() => ({}))
  try {
    // Tarea programada: autenticada con un secreto guardado en Vault
    if (body.action === 'cron') {
      const secret = await q<string>(db.rpc('get_cron_secret'))
      if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'No autorizado' }, 401)
      const households = await q<Household[]>(db.from('households').select('id, timezone, rotation_start').not('rotation_start', 'is', null))
      const out = []
      for (const h of households) out.push({ household: h.id, weeks: await ensureHousehold(h) })
      return json({ ok: true, out })
    }

    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: u } = await db.auth.getUser(token)
    if (!u?.user) return json({ error: 'Debes iniciar sesión' }, 401)
    const householdId = String(body.householdId ?? '')

    if (body.action === 'ensure') {
      await requireMember(u.user.id, householdId, false)
      return json({ ok: true, weeks: await ensureHousehold(await getHousehold(householdId)) })
    }
    if (body.action === 'draw') {
      await requireMember(u.user.id, householdId, true)
      return json({ ok: true, weeks: await draw(u.user.id, householdId, String(body.startDate)) })
    }
    if (body.action === 'regenerate') {
      await requireMember(u.user.id, householdId, true)
      const h = await getHousehold(householdId)
      const week = weekStartOf(String(body.weekStart))
      if (!h.rotation_start || week < h.rotation_start) return json({ ok: true, skipped: 'La rotación aún no llega a esa semana' })
      const exists = await q<{ week_start: string }[]>(db.from('schedule_weeks').select('week_start').eq('household_id', h.id).eq('week_start', week))
      if (!exists.length) return json({ ok: true, skipped: 'Semana aún no repartida: se calculará con la ausencia' })
      await db.from('activity_log').insert({ household_id: h.id, actor_user_id: u.user.id, verb: 'semana_recalculada', payload: { semana: week } })
      return json({ ok: true, ...(await regenerateWeek(h, week)) })
    }
    return json({ error: 'Acción desconocida' }, 400)
  } catch (e) {
    if (e instanceof UserError) return json({ error: e.message }, 400)
    console.error(e)
    return json({ error: 'Error interno' }, 500)
  }
})
