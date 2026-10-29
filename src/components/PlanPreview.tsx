import { useState } from 'react'
import { fmtTime, repsLabel } from '../lib/format'
import type { Plan } from '../lib/types'

// Read-only view of a plan: every block, exercise, sets × reps, target weight and rest.
export default function PlanPreview({ plan }: { plan: Plan }) {
  const [showWarmup, setShowWarmup] = useState(false)
  return (
    <div className="stack" style={{ gap: 14 }}>
      {plan.coachNote && <div className="notice">{plan.coachNote}</div>}
      {plan.blocks.map((block, b) => {
        const collapsible = block.name === 'Warm-up'
        const open = !collapsible || showWarmup
        const mins = Math.round(block.items.reduce((t, it) => t + (it.kind === 'time' ? (it.seconds ?? 0) * it.sets * (it.perSide ? 2 : 1) : 0), 0) / 60)
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
              block.items.map((it, i) => (
                <div key={i} className="preview-row">
                  <span className="grow">{it.isMainLift ? <b>{it.name}</b> : it.name}</span>
                  <span className="preview-rx">
                    {repsLabel(it)}
                    {it.restSec > 0 && it.kind === 'reps' && <span className="muted"> · rest {fmtTime(it.restSec)}</span>}
                  </span>
                </div>
              ))}
            {open && block.items.some((it) => it.isMainLift && it.targetWeight == null && it.kind === 'reps') && (
              <p className="muted small">No weight shown = first time doing it. You'll pick a starting weight during the workout.</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
