// Pantalla provisoria para las pestañas que se construyen en fases siguientes
export function ComingSoon({ title, emoji, text }: { title: string; emoji: string; text: string }) {
  return (
    <div className="page">
      <h1 className="page-title">{title}</h1>
      <div className="card empty">
        <span className="big">{emoji}</span>
        <p className="muted">{text}</p>
      </div>
    </div>
  )
}
