import type { PlanItem } from './types'

export function fmtTime(sec: number) {
  const s = Math.abs(Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** "3 × 5 @ 135 lb", "3 × 8–12 each side", "40s each side" */
export function repsLabel(it: PlanItem) {
  const side = it.perSide ? ' each side' : ''
  if (it.kind === 'time') {
    const weight = it.targetWeight ? ` @ ${it.targetWeight} lb each hand` : ''
    return `${it.sets > 1 ? `${it.sets} × ` : ''}${it.seconds}s${side}${weight}`
  }
  const reps = it.repsMax ? `${it.reps}–${it.repsMax}` : `${it.reps}`
  return `${it.sets} × ${reps}${side}${it.targetWeight ? ` @ ${it.targetWeight} lb` : ''}`
}
