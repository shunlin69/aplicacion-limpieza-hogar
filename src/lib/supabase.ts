import { createClient } from '@supabase/supabase-js'
import { SUPABASE_KEY, SUPABASE_URL } from './config'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})

export type MemberRole = 'admin' | 'member'

export interface Profile {
  id: string
  display_name: string
  avatar: string
  color: string
}

export interface Household {
  id: string
  name: string
  timezone: string
  rotation_start: string | null // lunes en que parte la rotación
}

export interface Member {
  id: string
  household_id: string
  user_id: string
  role: MemberRole
  participates: boolean
  reminder_time: string
  rotation_order: number | null
  profile: Profile
}
