// Llamadas a la Edge Function "schedule" (reparto en el servidor)
import { supabase } from './supabase'

async function call(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('schedule', { body })
  if (error) {
    const b = await (error as { context?: Response }).context?.json?.().catch(() => null)
    throw new Error(b?.error ?? 'No se pudo contactar al servidor')
  }
  return data
}

export const ensureWeeks = (householdId: string) => call({ action: 'ensure', householdId })
export const drawRotation = (householdId: string, startDate: string) => call({ action: 'draw', householdId, startDate })
export const regenerateWeek = (householdId: string, weekStart: string) => call({ action: 'regenerate', householdId, weekStart })
