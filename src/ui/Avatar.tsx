import type { Profile } from '../lib/supabase'

export function Avatar({ profile, large }: { profile: Pick<Profile, 'avatar' | 'color'>; large?: boolean }) {
  return (
    <span className={`avatar${large ? ' avatar-lg' : ''}`} style={{ background: profile.color }} aria-hidden>
      {profile.avatar}
    </span>
  )
}
