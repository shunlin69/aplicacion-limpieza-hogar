// Pantalla de celebración: al terminar un turno o al coronar al campeón del mes.
// Rayos girando, check que se dibuja (o trofeo), puntos que suben y confeti.
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Reward } from '../core/ranking'
import { confetti } from '../lib/celebrate'
import { Escena } from './Escena'
import { useCountUp } from './useCountUp'

interface Props {
  variant: 'turno' | 'trofeo'
  title: string
  subtitle?: string
  points?: number
  rewards?: Reward[] // premios recién ganados
  children?: ReactNode
  buttonText?: string
  onClose: () => void
}

export function Celebracion({ variant, title, subtitle, points, rewards = [], children, buttonText = '¡Genial!', onClose }: Props) {
  const shown = useCountUp(points ?? 0, 1000, 450)

  useEffect(() => {
    confetti(90)
    const t = setTimeout(() => confetti(60), 700)
    return () => clearTimeout(t)
  }, [])

  return createPortal(
    <div className="celebra" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="celebra-card" onClick={(e) => e.stopPropagation()}>
        <div className="celebra-rays" aria-hidden />
        {variant === 'turno' ? (
          <svg className="celebra-check" viewBox="0 0 120 120" aria-hidden>
            <circle className="cc-ring" cx="60" cy="60" r="50" />
            <path className="cc-tick" d="M36 62l16 16 32-34" />
          </svg>
        ) : (
          <div className="celebra-trofeo">
            <Escena tipo="trofeo" />
          </div>
        )}
        <h2 className="celebra-title">{title}</h2>
        {subtitle && <p className="muted">{subtitle}</p>}
        {points !== undefined && (
          <div className="celebra-points">
            +{shown}
            <span>pts</span>
          </div>
        )}
        {rewards.length > 0 && (
          <div className="stack" style={{ gap: 8, width: '100%' }}>
            {rewards.map((r, i) => (
              <div key={r.id} className="celebra-reward" style={{ animationDelay: `${1.2 + i * 0.25}s` }}>
                <span className="space-icon">{r.icon}</span>
                <div style={{ textAlign: 'left' }}>
                  <div className="small muted">¡Premio desbloqueado!</div>
                  <b>{r.name}</b>
                </div>
              </div>
            ))}
          </div>
        )}
        {children}
        <button className="btn btn-block celebra-btn" onClick={onClose}>
          {buttonText}
        </button>
      </div>
    </div>,
    document.body,
  )
}
