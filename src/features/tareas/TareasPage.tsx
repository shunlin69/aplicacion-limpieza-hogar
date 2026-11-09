import { useState } from 'react'
import { useCatalog } from '../../hooks/useCatalog'
import { mensajeError } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import { useApp } from '../../state/AppState'
import { EspacioCard } from './EspacioCard'
import { TurnoCard } from './TurnoCard'

export function TareasPage() {
  const { household, isAdmin } = useApp()
  const { spaces, items, templates, loading, reload } = useCatalog(household?.id)
  const [error, setError] = useState('')

  async function addSpace() {
    setError('')
    const order = Math.max(0, ...spaces.map((s) => s.sort_order)) + 1
    const { error: err } = await supabase.from('spaces').insert({ household_id: household!.id, name: 'Nuevo espacio', icon: '🧹', difficulty: 2, minutes: 20, sort_order: order })
    if (err) setError(mensajeError(err))
    void reload()
  }

  if (loading) return <div className="spinner" aria-label="Cargando" />

  return (
    <div className="page">
      <div>
        <h1 className="page-title">Tareas</h1>
        <p className="page-sub">Qué se limpia y qué día. {isAdmin ? 'Como admin, puedes editarlo.' : 'Solo los admins pueden editarlo.'}</p>
      </div>

      <h2 className="section-title">Turnos de la semana</h2>
      {templates.map((t) => (
        <TurnoCard key={t.id} template={t} spaces={spaces} householdId={household!.id} isAdmin={isAdmin} onChange={reload} />
      ))}

      <h2 className="section-title">Espacios y qué significa “limpio”</h2>
      {spaces.map((s) => (
        <EspacioCard key={s.id} space={s} items={items.filter((i) => i.space_id === s.id)} isAdmin={isAdmin} onChange={reload} />
      ))}
      {isAdmin && (
        <button className="btn btn-soft btn-block" onClick={addSpace}>
          + Agregar espacio
        </button>
      )}
      {error && <div className="alert alert-error">{error}</div>}
    </div>
  )
}
