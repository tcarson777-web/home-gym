import { describe, expect, it } from 'vitest'
import { barbellLoads, capabilities, dumbbellLoads, loadsFor } from './equipment'
import { canDo, EXERCISE_BY_ID } from './exercises'
import { buildRulesPlan, type PlanContext } from './planner'
import { prescribe, type Performance } from './progression'
import type { Equipment, Profile, SetLog } from './types'
import { DEFAULT_PROFILE } from './db'
import { weekStatus } from './schedule'

const garage: Equipment[] = [
  { kind: 'barbell', name: 'Bar', barWeight: 45 },
  { kind: 'plates', name: 'Plates', plates: [{ weight: 45, pairs: 2 }, { weight: 10, pairs: 1 }, { weight: 5, pairs: 1 }, { weight: 2.5, pairs: 1 }] },
  { kind: 'rack', name: 'Rack' },
  { kind: 'bench', name: 'Bench', incline: true },
  { kind: 'adjustable_dumbbells', name: 'DBs', minWeight: 5, maxWeight: 52.5, increment: 2.5 },
]

const sets = (weight: number, reps: number[], rpe = 8): SetLog[] =>
  reps.map((r, i) => ({ sessionId: 1, exerciseId: 'x', exerciseName: 'x', blockIdx: 1, itemIdx: 0, setIdx: i, weight, reps: r, rpe, loggedAt: '' }))
const perf = (s: SetLog[], date = '2026-10-01'): Performance => ({ sessionId: 1, date, sets: s })

describe('equipment loads', () => {
  it('builds barbell totals from plate pairs', () => {
    const loads = barbellLoads(garage)
    expect(loads[0]).toBe(45)
    expect(loads).toContain(50) // 45 + 2×2.5
    expect(loads).toContain(225) // 45 + 2×(45+45)
    expect(loads).not.toContain(47.5) // can't load one side only
  })
  it('expands adjustable dumbbell ranges', () => {
    const d = dumbbellLoads(garage)
    expect(d[0]).toBe(5)
    expect(d[d.length - 1]).toBe(52.5)
    expect(d).toContain(27.5)
  })
})

describe('progression', () => {
  const squat = EXERCISE_BY_ID.get('bb_back_squat')!
  const loads = barbellLoads(garage)
  it('adds 10 lb to a squat after a clean session', () => {
    expect(prescribe(squat, { sets: 3, reps: 5 }, [perf(sets(135, [5, 5, 5]))], loads).targetWeight).toBe(145)
  })
  it('repeats the weight after one miss', () => {
    expect(prescribe(squat, { sets: 3, reps: 5 }, [perf(sets(135, [5, 4, 3]))], loads).targetWeight).toBe(135)
  })
  it('deloads after two misses at the same weight', () => {
    const h = [perf(sets(135, [5, 4, 3]), '2026-10-03'), perf(sets(135, [5, 5, 4]), '2026-10-01')]
    const full = barbellLoads([...garage, { kind: 'plates', name: 'More', plates: [{ weight: 25, pairs: 1 }, { weight: 10, pairs: 1 }] }])
    expect(prescribe(squat, { sets: 3, reps: 5 }, h, full).targetWeight).toBe(120)
  })
  it('never makes a huge jump when plates are sparse', () => {
    // Sparse plates: 170 lb is reachable but the next step up is 225.
    const up = prescribe(squat, { sets: 3, reps: 5 }, [perf(sets(170, [5, 5, 5]))], loads)
    expect(up.targetWeight).toBe(170)
    const h = [perf(sets(135, [5, 4, 3]), '2026-10-03'), perf(sets(135, [5, 5, 4]), '2026-10-01')]
    const down = prescribe(squat, { sets: 3, reps: 5 }, h, loads)
    expect(down.targetWeight).toBe(135)
    expect(down.reps).toBe(3)
  })
  it('holds weight when the last set was an all-out grinder', () => {
    expect(prescribe(squat, { sets: 3, reps: 5 }, [perf(sets(135, [5, 5, 5], 10))], loads).targetWeight).toBe(135)
  })
  it('double progression moves dumbbells up only after the top of the range', () => {
    const row = EXERCISE_BY_ID.get('db_row')!
    const d = loadsFor('dumbbell', garage)
    expect(prescribe(row, { sets: 3, reps: 6, repsMax: 10 }, [perf(sets(40, [10, 10, 10]))], d).targetWeight).toBe(42.5)
    expect(prescribe(row, { sets: 3, reps: 6, repsMax: 10 }, [perf(sets(40, [10, 9, 8]))], d).targetWeight).toBe(40)
  })
})

describe('planner', () => {
  const profile: Profile = DEFAULT_PROFILE
  const ctx = (equipment: Equipment[], variant: 'A' | 'B' = 'A'): PlanContext => ({ equipment, profile, type: 'strength', variant, history: new Map() })

  it('only uses exercises the equipment allows, starts with a warm-up and fits 45 min', () => {
    for (const eq of [garage, [], [{ kind: 'kettlebells', name: 'KB', weights: [26, 35, 53] } as Equipment]]) {
      for (const variant of ['A', 'B'] as const) {
        const plan = buildRulesPlan(ctx(eq, variant))
        const caps = capabilities(eq)
        expect(plan.blocks[0].name).toBe('Warm-up')
        expect(plan.estimatedMinutes).toBeLessThanOrEqual(45)
        for (const b of plan.blocks)
          for (const it of b.items) expect(canDo(EXERCISE_BY_ID.get(it.exerciseId)!, caps, (l) => loadsFor(l, eq).length > 0)).toBe(true)
      }
    }
  })
  it('uses the barbell when there is a rack', () => {
    expect(buildRulesPlan(ctx(garage)).blocks[1].items[0].exerciseId).toBe('bb_back_squat')
  })
  it('mobility session fits the time budget', () => {
    const plan = buildRulesPlan({ ...ctx(garage), type: 'mobility' })
    expect(plan.estimatedMinutes).toBeGreaterThanOrEqual(38)
    expect(plan.estimatedMinutes).toBeLessThanOrEqual(47)
  })
})

describe('week status', () => {
  const s = (date: string, type: 'strength' | 'mobility') => ({ date, type, status: 'done' as const, plan: {} as never, bonus: false, checked: [] })
  it('suggests mobility after a lifting day when none done yet', () => {
    expect(weekStatus([s('2026-10-27T10:00:00', 'strength')], 3, new Date('2026-10-29T10:00:00')).suggested).toBe('mobility')
  })
  it('is complete with 3 sessions incl. mobility', () => {
    const w = weekStatus([s('2026-10-26T10:00:00', 'strength'), s('2026-10-27T10:00:00', 'mobility'), s('2026-10-28T10:00:00', 'strength')], 3, new Date('2026-10-29T10:00:00'))
    expect(w.complete).toBe(true)
  })
})
