import { useState } from 'react'
import { repsLabel } from '../lib/format'
import type { PlanItem } from '../lib/types'

interface Props {
  item: PlanItem
  options: PlanItem[] | undefined // undefined while loading
  onSwap: (replacement: PlanItem, neverAgain: boolean) => void
  onSkip: (neverAgain: boolean) => void
  onClose: () => void
}

// Bottom sheet: swap an exercise for today, skip it today, and optionally stop suggesting it.
export default function SwapSheet({ item, options, onSwap, onSkip, onClose }: Props) {
  const [neverAgain, setNeverAgain] = useState(false)
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet stack" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Swap ${item.name}`}>
        <div className="row between">
          <h2>Swap {item.name}</h2>
          <button className="btn ghost sm" onClick={onClose}>Cancel</button>
        </div>
        <p className="muted small">Just for today. Your progress on {item.name} is kept.</p>

        {options === undefined ? (
          <p className="muted">Finding options…</p>
        ) : options.length === 0 ? (
          <p className="muted small">Nothing else fits your equipment for this slot.</p>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            {options.map((o) => (
              <button key={o.exerciseId} className="sheet-option" onClick={() => onSwap(o, neverAgain)}>
                <span>{o.name}</span>
                <span className="muted small">{repsLabel(o)}</span>
              </button>
            ))}
          </div>
        )}

        <button className="btn" onClick={() => onSkip(neverAgain)}>Skip it today</button>

        <label className="row" style={{ minHeight: 48 }}>
          <input type="checkbox" style={{ width: 24, height: 24 }} checked={neverAgain} onChange={(e) => setNeverAgain(e.target.checked)} />
          <span>Also stop suggesting {item.name} in future workouts <span className="muted small">(undo in Settings)</span></span>
        </label>
      </div>
    </div>
  )
}
