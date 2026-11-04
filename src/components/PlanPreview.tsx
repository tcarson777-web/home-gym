import { useState } from 'react'
import { howToUrl } from '../lib/figures'
import { fmtTime, repsLabel } from '../lib/format'
import Figure from './Figure'
import type { Plan } from '../lib/types'

interface Props {
  plan: Plan
  onSwap?: (blockIdx: number, itemIdx: number) => void // ⇄ button: swap / skip menu
  onUnskip?: (blockIdx: number, itemIdx: number) => void
}

// The plan at a glance: every block and exercise with sets × reps, target weight and rest.
// Tap an exercise for details (drawing, instructions, video link); ⇄ to swap or skip it.
export default function PlanPreview({ plan, onSwap, onUnskip }: Props) {
  const [showWarmup, setShowWarmup] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  return (
    <div className="stack" style={{ gap: 14 }}>
      {plan.coachNote && <div className="notice">{plan.coachNote}</div>}
      {plan.blocks.map((block, b) => {
        const collapsible = block.name === 'Warm-up'
        const open = !collapsible || showWarmup
        const mins = Math.round(block.items.reduce((t, it) => t + (it.kind === 'time' && !it.skipped ? (it.seconds ?? 0) * it.sets * (it.perSide ? 2 : 1) : 0), 0) / 60)
        return (
          <div key={b} className="stack" style={{ gap: 6 }}>
            <button
              className="row between"
              style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }}
              onClick={() => collapsible && setShowWarmup(!showWarmup)}
            >
              <h3>{block.name}</h3>
              {collapsible && (
                <span className="muted small">
                  {block.items.length} moves{mins ? ` · ~${mins} min` : ''} {open ? '▲' : '▼'}
                </span>
              )}
            </button>
            {open &&
              block.items.map((it, i) => {
                const key = `${b}:${i}`
                const isOpen = expanded === key && !it.skipped
                return (
                  <div key={`${key}:${it.exerciseId}`}>
                    <div className="preview-row" style={{ alignItems: 'center' }}>
                      <button
                        className="grow row"
                        style={{ gap: 8, background: 'none', border: 0, padding: 0, textAlign: 'left', minWidth: 0 }}
                        onClick={() => setExpanded(isOpen ? null : key)}
                        aria-expanded={isOpen}
                      >
                        <span className="preview-thumb"><Figure exerciseId={it.exerciseId} size={44} first /></span>
                        <span style={{ minWidth: 0 }}>
                          <span className={it.skipped ? 'skipped' : ''}>{it.isMainLift ? <b>{it.name}</b> : it.name}</span>
                          {it.swappedFrom && !it.skipped && <span className="muted small" style={{ display: 'block' }}>instead of {it.swappedFrom}</span>}
                          {it.skipped && <span className="muted small" style={{ display: 'block' }}>Skipped today</span>}
                        </span>
                      </button>
                      {it.skipped ? (
                        onUnskip && <button className="btn ghost sm" onClick={() => onUnskip(b, i)}>Undo</button>
                      ) : (
                        <>
                          <span className="preview-rx">
                            {repsLabel(it)}
                            {it.restSec > 0 && it.kind === 'reps' && <span className="muted"> · rest {fmtTime(it.restSec)}</span>}
                          </span>
                          {onSwap && (
                            <button className="swap-btn" aria-label={`Swap or skip ${it.name}`} onClick={() => onSwap(b, i)}>⇄</button>
                          )}
                        </>
                      )}
                    </div>
                    {isOpen && (
                      <div className="preview-detail stack" style={{ gap: 8 }}>
                        <Figure exerciseId={it.exerciseId} size={84} />
                        {it.cue && <p className="small muted">{it.cue}</p>}
                        <a className="small" href={howToUrl(it.name)} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>▶ How to (video)</a>
                      </div>
                    )}
                  </div>
                )
              })}
            {open && block.items.some((it) => it.isMainLift && it.targetWeight == null && it.kind === 'reps' && !it.skipped) && (
              <p className="muted small">No weight shown = first time doing it. You'll pick a starting weight during the workout.</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
