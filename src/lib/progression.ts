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
const BREAK_DAYS = 21 // longer than this since last time = ease back in
const DAY_MS = 86_400_000

/** Sets that count: warm-up sets are logged but never judged. */
const workingSets = (sets: SetLog[]) => sets.filter((s) => !s.warmup)

function topWeight(sets: SetLog[]): number | undefined {
  const ws = sets.map((s) => s.weight).filter((w): w is number => w != null)
  return ws.length ? Math.max(...ws) : undefined
}

/** Enough working sets, and every one reached the target reps. */
function hitTarget(sets: SetLog[], scheme: Scheme, reps: number): boolean {
  return sets.length >= scheme.sets && sets.every((s) => (s.reps ?? 0) >= reps)
}

/**
 * Weight you could lift for `reps` with ~2 reps in reserve, estimated from your best set
 * (Epley formula, counting the reps you said you had left via the effort rating).
 */
function projectedWeight(sets: SetLog[], reps: number): number {
  let e1rm = 0
  for (const s of sets) {
    if (s.weight == null || !s.reps) continue
    const inReserve = s.rpe != null ? Math.max(0, 10 - s.rpe) : 2
    e1rm = Math.max(e1rm, s.weight * (1 + (s.reps + inReserve) / 30))
  }
  return e1rm / (1 + (reps + 2) / 30)
}

/** Decide today's weight and reps for one exercise from its history. */
export function prescribe(ex: Exercise, scheme: Scheme, history: Performance[], loads: number[], now = Date.now()): Prescription {
  const sessions = history.map((p) => ({ ...p, sets: workingSets(p.sets) })).filter((p) => p.sets.length > 0)
  const last = sessions[0]
  const weighted = isWeighted(ex.loading)

  if (!last) {
    return {
      reps: scheme.reps,
      repsMax: scheme.repsMax,
      note: weighted
        ? 'First time: pick a weight where the last rep feels like you have 2–3 left in the tank.'
        : 'First time: find a version you can do with good form.',
    }
  }

  const sets = last.sets
  const lastWeight = topWeight(sets)
  const maxRpe = Math.max(...sets.map((s) => s.rpe ?? 0))
  const daysAway = Math.floor((now - new Date(last.date).getTime()) / DAY_MS)

  // Long break: strength fades a little, so ease back in rather than adding weight.
  if (daysAway > BREAK_DAYS) {
    const weeks = Math.round(daysAway / 7)
    if (weighted && lastWeight != null) {
      const target = roundDown(lastWeight * 0.9, loads) ?? Math.round((lastWeight * 0.9) / 5) * 5
      return { targetWeight: target, reps: scheme.reps, repsMax: scheme.repsMax, note: `${weeks} weeks since you last did this — easing back in at ~90% (${target} lb). It'll come back fast.` }
    }
    return { reps: scheme.reps, repsMax: scheme.repsMax, note: `${weeks} weeks since you last did this — take it easy today and leave a few reps in the tank.` }
  }

  // Bodyweight / bands: progress reps only.
  if (!weighted || lastWeight == null) {
    // Band-assisted sets don't count as full reps: progress on the unassisted ones.
    const assisted = sets.filter((s) => s.assist)
    const unassisted = sets.filter((s) => !s.assist)
    if (assisted.length > 0) {
      if (unassisted.length === 0) {
        return { reps: scheme.reps, repsMax: scheme.repsMax, note: 'Every set used a band last time. Try your first set without it, or use a lighter band.' }
      }
      const best = Math.max(...unassisted.map((s) => s.reps ?? 0))
      return {
        reps: scheme.reps,
        repsMax: scheme.repsMax,
        note: `Last time: ${unassisted.length} set${unassisted.length > 1 ? 's' : ''} without a band (best ${best}), ${assisted.length} with. Goal: one more rep or one more set before reaching for the band.`,
      }
    }
    const minReps = Math.min(...sets.map((s) => s.reps ?? 0))
    const top = scheme.repsMax ?? scheme.reps
    if (minReps >= top) {
      return { reps: top, note: 'You hit the top of the range. Make it harder: slower lowering, a pause, or a tougher variation.' }
    }
    return { reps: Math.max(scheme.reps, Math.min(top, minReps + 1)), repsMax: scheme.repsMax, note: `Last time your lowest set was ${minReps}. Beat it by one rep.` }
  }

  // Way more reps than planned (e.g. 10 when 5 were planned): the weight was too light.
  // Jump to what your best set suggests, capped at +25% so one great day can't overshoot.
  const bestReps = Math.max(...sets.filter((s) => s.weight === lastWeight).map((s) => s.reps ?? 0))
  const overshootAt = (scheme.repsMax ?? scheme.reps) + 3
  if (bestReps >= overshootAt && maxRpe < TOP_EFFORT) {
    const projected = Math.min(projectedWeight(sets, scheme.reps), lastWeight * 1.25)
    const target = roundDown(projected, loads) ?? Math.floor(projected / 5) * 5
    if (target > lastWeight) {
      return {
        targetWeight: target,
        reps: scheme.reps,
        repsMax: scheme.repsMax,
        note: `You did ${bestReps} reps at ${lastWeight} lb when ${scheme.repsMax ?? scheme.reps} were planned, so that was too light. Try ${target} lb for ${scheme.reps}${scheme.repsMax ? `–${scheme.repsMax}` : ''}.`,
      }
    }
  }

  // Double progression (rep range).
  if (scheme.repsMax != null) {
    if (hitTarget(sets, scheme, scheme.repsMax) && maxRpe < TOP_EFFORT) {
      const up = nextUp(lastWeight, loads) ?? lastWeight
      if (up > lastWeight) {
        return { targetWeight: up, reps: scheme.reps, repsMax: scheme.repsMax, note: `You hit ${scheme.repsMax} reps on every set — up to ${up} lb, back to ${scheme.reps}+ reps.` }
      }
      return { targetWeight: lastWeight, reps: scheme.repsMax, note: `You've maxed out the weights you own for this. Slow the lowering to 3 seconds.` }
    }
    const minReps = Math.min(...sets.filter((s) => s.weight === lastWeight).map((s) => s.reps ?? 0))
    return { targetWeight: lastWeight, reps: scheme.reps, repsMax: scheme.repsMax, note: `Same weight as last time. Try to get ${Math.min(scheme.repsMax, minReps + 1)}+ reps on each set.` }
  }

  // Linear progression (fixed reps) for barbell lifts.
  if (hitTarget(sets, scheme, scheme.reps) && maxRpe < TOP_EFFORT) {
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
  let streak = 0
  for (const p of sessions) {
    if (topWeight(p.sets) !== lastWeight || hitTarget(p.sets, scheme, scheme.reps)) break
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
