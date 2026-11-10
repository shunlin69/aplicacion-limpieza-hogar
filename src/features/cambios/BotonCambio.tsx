// Botón "Pedir cambio" para un turno propio (o aviso si ya hay uno en curso)
import { useState } from 'react'
import type { LocalDate } from '../../core/dates'
import { isOpen, type Swap } from '../../hooks/useSwaps'
import type { WeekShift } from '../../hooks/useWeek'
import { useApp } from '../../state/AppState'
import { PedirCambio } from './PedirCambio'

export function BotonCambio({ shift, swaps, today }: { shift: WeekShift; swaps: Swap[]; today: LocalDate }) {
  const { household, members, me } = useApp()
  const [open, setOpen] = useState(false)
  if (!me || !household || !shift.id || shift.memberId !== me.id || shift.status !== 'pending' || shift.date < today) return null
  const pending = swaps.some((s) => isOpen(s) && (s.shiftId === shift.id || s.targetShiftId === shift.id))
  if (pending) return <span className="badge badge-info">🔄 Cambio en curso</span>
  return (
    <>
      <button className="btn btn-soft btn-small" onClick={() => setOpen(true)}>
        🔄 Pedir cambio
      </button>
      {open && <PedirCambio shift={shift} householdId={household.id} members={members} meId={me.id} today={today} onClose={() => setOpen(false)} />}
    </>
  )
}
