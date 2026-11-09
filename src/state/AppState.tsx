// Estado global: sesión, perfil, hogar e integrantes.
// Los integrantes se actualizan en tiempo real (si alguien se une, aparece al tiro).
import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase, type Household, type Member, type Profile } from '../lib/supabase'

interface AppState {
  loading: boolean
  session: Session | null
  profile: Profile | null
  household: Household | null
  members: Member[]
  me: Member | null
  isAdmin: boolean
  refresh: () => Promise<void>
}

const Ctx = createContext<AppState | null>(null)

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [dataReady, setDataReady] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [household, setHousehold] = useState<Household | null>(null)
  const [members, setMembers] = useState<Member[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id

  const refresh = useCallback(async () => {
    if (!userId) {
      setProfile(null)
      setHousehold(null)
      setMembers([])
      setDataReady(true)
      return
    }
    const [{ data: prof }, { data: mine }] = await Promise.all([
      supabase.from('profiles').select('id, display_name, avatar, color').eq('id', userId).single(),
      // Por ahora una persona pertenece a un solo hogar; el modelo ya admite varios
      supabase.from('household_members').select('household_id').eq('user_id', userId).order('joined_at').limit(1),
    ])
    setProfile(prof ?? null)
    const householdId = mine?.[0]?.household_id
    if (!householdId) {
      setHousehold(null)
      setMembers([])
      setDataReady(true)
      return
    }
    const [{ data: h }, { data: ms }] = await Promise.all([
      supabase.from('households').select('id, name, timezone').eq('id', householdId).single(),
      supabase
        .from('household_members')
        .select('id, household_id, user_id, role, participates, reminder_time, profile:profiles!household_members_user_id_profiles_fkey(id, display_name, avatar, color)')
        .eq('household_id', householdId)
        .order('joined_at'),
    ])
    setHousehold(h ?? null)
    setMembers((ms as unknown as Member[]) ?? [])
    setDataReady(true)
  }, [userId])

  useEffect(() => {
    if (!authReady) return
    setDataReady(false)
    void refresh()
  }, [authReady, refresh])

  // Tiempo real: cambios en integrantes o perfiles del hogar
  useEffect(() => {
    if (!household) return
    const channel = supabase
      .channel(`hogar-${household.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'household_members', filter: `household_id=eq.${household.id}` }, () => void refresh())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, () => void refresh())
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [household, refresh])

  const value = useMemo<AppState>(() => {
    const me = members.find((m) => m.user_id === userId) ?? null
    return {
      loading: !authReady || (!!session && !dataReady),
      session,
      profile,
      household,
      members,
      me,
      isAdmin: me?.role === 'admin',
      refresh,
    }
  }, [authReady, dataReady, session, profile, household, members, userId, refresh])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp fuera de AppStateProvider')
  return v
}
