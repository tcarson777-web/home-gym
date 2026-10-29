import type { Exercise } from './exercises'
import { isWeighted, nextUp, roundDown } from './equipment'
import type { SetLog } from './types'

// Past performances of one exercise, newest first.
export interface Performance {
  sessionId: number
  date: string
  sets: SetLog[]
}

export interface Scheme {
  sets: number
  reps: number // fixed target, or bottom of the range
  repsMax?: number // top of the range (double progression)
}

export interface Prescription {
  targetWeight?: number
  reps: number
  repsMax?: number
  note: string
}

const TOP_EFFORT = 10

function topWeight(sets: SetLog[]): number | undefined {
  const ws = sets.map((s) => s.weight).filter((w): w is number => w != null)
  return ws.length ? Math.max(...ws) : undefined
}

function hitTarget(p: Performance, scheme: Scheme, reps: number): boolean {
  const top = topWeight(p.sets)
  const working = p.sets.filter((s) => s.weight === top)
  return working.length >= scheme.sets && working.every((s) => (s.reps ?? 0) >= reps)
}

/** Decide today's weight and reps for one exercise from its history. */
export function prescribe(ex: Exercise, scheme: Scheme, history: Performance[], loads: number[]): Prescription {
  const last = history[0]
  const weighted = isWeighted(ex.loading)

  if (!last || last.sets.length === 0) {
    return {
      reps: scheme.reps,
      repsMax: scheme.repsMax,
      note: weighted
        ? 'First time: pick a weight where the last rep feels like you have 2–3 left in the tank.'
        : 'First time: find a version you can do with good form.',
    }
  }

  const lastWeight = topWeight(last.sets)
  const maxRpe = Math.max(...last.sets.map((s) => s.rpe ?? 0))

  // Bodyweight / bands: progress reps only.
  if (!weighted || lastWeight == null) {
    const minReps = Math.min(...last.sets.map((s) => s.reps ?? 0))
    const top = scheme.repsMax ?? scheme.reps
    if (minReps >= top) {
      return { reps: top, note: 'You hit the top of the range. Make it harder: slower lowering, a pause, or a tougher variation.' }
    }
    return { reps: Math.max(scheme.reps, Math.min(top, minReps + 1)), repsMax: scheme.repsMax, note: `Last time your lowest set was ${minReps}. Beat it by one rep.` }
  }

  // Double progression (rep range).
  if (scheme.repsMax != null) {
    if (hitTarget(last, scheme, scheme.repsMax) && maxRpe < TOP_EFFORT) {
      const up = nextUp(lastWeight, loads) ?? lastWeight
      if (up > lastWeight) {
        return { targetWeight: up, reps: scheme.reps, repsMax: scheme.repsMax, note: `You hit ${scheme.repsMax} reps on every set — up to ${up} lb, back to ${scheme.reps}+ reps.` }
      }
      return { targetWeight: lastWeight, reps: scheme.repsMax, note: `You've maxed out the weights you own for this. Slow the lowering to 3 seconds.` }
    }
    const minReps = Math.min(...last.sets.filter((s) => s.weight === lastWeight).map((s) => s.reps ?? 0))
    return { targetWeight: lastWeight, reps: scheme.reps, repsMax: scheme.repsMax, note: `Same weight as last time. Try to get ${Math.min(scheme.repsMax, minReps + 1)}+ reps on each set.` }
  }

  // Linear progression (fixed reps) for barbell lifts.
  if (hitTarget(last, scheme, scheme.reps) && maxRpe < TOP_EFFORT) {
    const jump = ex.lowerBody ? 10 : 5
    let target = roundDown(lastWeight + jump, loads) ?? lastWeight + jump
    if (target <= lastWeight) target = nextUp(lastWeight, loads) ?? lastWeight
    if (target > lastWeight + 2 * jump) {
      return { targetWeight: lastWeight, reps: scheme.reps, note: `Ready to add weight, but your plates jump from ${lastWeight} to ${target} lb. Stay at ${lastWeight} and add smaller plates to your equipment list.` }
    }
    if (target === lastWeight) {
      return { targetWeight: lastWeight, reps: scheme.reps, note: `Ready to add weight, but that's the heaviest you can load. Stay at ${lastWeight} lb.` }
    }
    return { targetWeight: target, reps: scheme.reps, note: `All reps hit last time at ${lastWeight} lb — add weight.` }
  }

  // Missed reps: repeat, unless it's the second miss in a row at this weight.
  const failsAtWeight = history.filter((p) => topWeight(p.sets) === lastWeight)
  let streak = 0
  for (const p of failsAtWeight) {
    if (hitTarget(p, scheme, scheme.reps)) break
    streak++
  }
  if (streak >= 2) {
    const target = roundDown(lastWeight * 0.9, loads) ?? Math.round((lastWeight * 0.9) / 5) * 5
    if (target < lastWeight * 0.8) {
      return { targetWeight: lastWeight, reps: Math.max(1, scheme.reps - 2), note: `Two tough sessions at ${lastWeight} lb, but your plates can't make a small step down. Do ${scheme.reps - 2} reps per set today.` }
    }
    return { targetWeight: target, reps: scheme.reps, note: `Two tough sessions at ${lastWeight} lb — reset to ${target} lb and build back up.` }
  }
  return { targetWeight: lastWeight, reps: scheme.reps, note: `Repeat ${lastWeight} lb and aim to hit all reps.` }
}
