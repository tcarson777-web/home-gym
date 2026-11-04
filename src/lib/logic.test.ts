import { describe, expect, it } from 'vitest'
import { barbellLoads, capabilities, describePlates, dumbbellLoads, landmineLoads, loadsFor, parseList, platesFor } from './equipment'
import { equipmentUsage, guessKind } from './usage'
import { canDo, EXERCISE_BY_ID } from './exercises'
import { buildRulesPlan, type PlanContext } from './planner'
import { prescribe, type Performance } from './progression'
import type { Equipment, Profile, SetLog } from './types'
import { DEFAULT_PROFILE, sessionRange } from './db'
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
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
const perf = (s: SetLog[], date = daysAgo(3)): Performance => ({ sessionId: 1, date, sets: s })

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
    const h = [perf(sets(135, [5, 4, 3]), daysAgo(2)), perf(sets(135, [5, 5, 4]), daysAgo(5))]
    const full = barbellLoads([...garage, { kind: 'plates', name: 'More', plates: [{ weight: 25, pairs: 1 }, { weight: 10, pairs: 1 }] }])
    expect(prescribe(squat, { sets: 3, reps: 5 }, h, full).targetWeight).toBe(120)
  })
  it('never makes a huge jump when plates are sparse', () => {
    // Sparse plates: 170 lb is reachable but the next step up is 225.
    const up = prescribe(squat, { sets: 3, reps: 5 }, [perf(sets(170, [5, 5, 5]))], loads)
    expect(up.targetWeight).toBe(170)
    const h = [perf(sets(135, [5, 4, 3]), daysAgo(2)), perf(sets(135, [5, 5, 4]), daysAgo(5))]
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
        expect(plan.estimatedMinutes).toBeLessThanOrEqual(60)
        for (const b of plan.blocks)
          for (const it of b.items) expect(canDo(EXERCISE_BY_ID.get(it.exerciseId)!, caps, (l) => loadsFor(l, eq).length > 0)).toBe(true)
      }
    }
  })
  it('respects a strict 45-minute cap', () => {
    const strict = { ...profile, sessionMinutes: 40, sessionMaxMinutes: 45 }
    for (const variant of ['A', 'B'] as const)
      expect(buildRulesPlan({ ...ctx(garage, variant), profile: strict }).estimatedMinutes).toBeLessThanOrEqual(45)
  })
  it('lands inside a 45–60 range with a full garage, keeping lunges and core', () => {
    for (const variant of ['A', 'B'] as const) {
      const plan = buildRulesPlan(ctx(garage, variant))
      expect(plan.estimatedMinutes).toBeGreaterThanOrEqual(45)
      expect(plan.estimatedMinutes).toBeLessThanOrEqual(60)
    }
    const a = buildRulesPlan(ctx(garage, 'A')).blocks[2].items.map((i) => i.exerciseId)
    expect(a).toContain('db_reverse_lunge')
  })
  it('older saved profiles without a max default to min + 15', () => {
    expect(sessionRange({ ...profile, sessionMinutes: 45, sessionMaxMinutes: undefined })).toEqual({ min: 45, max: 60 })
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

describe('landmine', () => {
  const withLandmine: Equipment[] = [...garage, { id: 99, kind: 'landmine', name: 'Landmine' }]
  const ctx = (equipment: Equipment[], variant: 'A' | 'B'): PlanContext => ({ equipment, profile: DEFAULT_PROFILE, type: 'strength', variant, history: new Map() })
  const ids = (equipment: Equipment[], variant: 'A' | 'B') => buildRulesPlan(ctx(equipment, variant)).blocks.flatMap((b) => b.items.map((i) => i.exerciseId))

  it('loads plates on one end, starting from the empty bar', () => {
    const l = landmineLoads(withLandmine)
    expect(l[0]).toBe(0)
    expect(l).toContain(2.5)
    expect(l).toContain(90 + 10) // two 45s + one 10 on the same end
  })
  it('needs a barbell', () => {
    expect(landmineLoads([{ kind: 'landmine', name: 'L' }, { kind: 'plates', name: 'P', plates: [{ weight: 10, pairs: 1 }] }])).toEqual([])
  })
  it('shows up on day A as core work when you have one', () => {
    expect(ids(withLandmine, 'A')).toContain('lm_rotation')
    expect(ids(garage, 'A')).not.toContain('lm_rotation')
  })
  it('becomes the overhead press when there is no rack', () => {
    const noRack = withLandmine.filter((e) => e.kind !== 'rack')
    expect(ids(noRack, 'B')).toContain('lm_press')
    expect(ids(noRack, 'A')).toContain('lm_squat')
  })
  it('usage report explains used, unused and unknown equipment', () => {
    const items: Equipment[] = [...withLandmine, { id: 100, kind: 'other', name: 'Sled' }]
    const u = equipmentUsage(items, DEFAULT_PROFILE)
    expect(u.get(99)!.inPlans).toContain('Landmine rotation')
    expect(u.get(99)!.alternatives).toContain('Half-kneeling landmine press')
    expect(u.get(100)!.warning).toMatch(/ignores it/)
    const lonely = equipmentUsage([{ id: 1, kind: 'landmine', name: 'L' }], DEFAULT_PROFILE)
    expect(lonely.get(1)!.warning).toMatch(/also needs Barbell\./)
  })
})

describe('equipment diagnostics', () => {
  const u = (items: Equipment[]) => equipmentUsage(items.map((e, i) => ({ ...e, id: i + 1 })), DEFAULT_PROFILE)

  it('explains that a rack and bench need a barbell or dumbbells', () => {
    const r = u([{ kind: 'rack', name: 'Rack' }, { kind: 'bench', name: 'Bench', incline: true }])
    expect(r.get(1)!.warning).toMatch(/Barbell/)
    // A bench alone is usable now (bench dips), and lists what more gear would unlock
    expect(r.get(2)!.warning).toBeUndefined()
    expect(r.get(2)!.inPlans).toContain('Bench dip')
  })
  it('points at a barbell saved as Other', () => {
    const r = u([{ kind: 'rack', name: 'Rack' }, { kind: 'other', name: 'Olympic bar' }])
    expect(r.get(1)!.warning).toMatch(/“Olympic bar” is saved as Other/)
    expect(r.get(2)!.warning).toMatch(/Looks like a Barbell/)
  })
  it('warns when a barbell has no plates', () => {
    const r = u([{ kind: 'barbell', name: 'Bar', barWeight: 45 }, { kind: 'rack', name: 'Rack' }])
    expect(r.get(1)!.warning).toMatch(/No weight plates/)
    expect(r.get(2)!.warning).toBeUndefined()
  })
  it('does not mistake a pull-up bar for a barbell', () => {
    expect(guessKind({ kind: 'other', name: 'Doorway pull-up bar' })).toBe('pullup_bar')
  })
  it('flags dumbbells with no weights, and the bench that depends on them', () => {
    const r = u([{ kind: 'fixed_dumbbells', name: 'Dumbbells', weights: [] }, { kind: 'bench', name: 'Bench' }])
    expect(r.get(1)!.warning).toMatch(/No weights entered/)
    const rack = u([{ kind: 'fixed_dumbbells', name: 'Dumbbells', weights: [] }, { kind: 'rack', name: 'Rack' }])
    expect(rack.get(1)!.warning).toMatch(/No weights entered/)
  })
  it('is happy with a normal garage', () => {
    const r = u(garage)
    for (const usage of r.values()) expect(usage.warning).toBeUndefined()
  })
  it('parses weight lists and ranges', () => {
    expect(parseList('10, 15, 20')).toEqual([10, 15, 20])
    expect(parseList('5-25')).toEqual([5, 10, 15, 20, 25])
    expect(parseList('5-10 by 2.5, 35')).toEqual([5, 7.5, 10, 35])
  })
})

describe('band-assisted pull-ups', () => {
  const pullup = EXERCISE_BY_ID.get('pullup')!
  const scheme = { sets: 3, reps: 5, repsMax: 15 }
  const set = (reps: number, assist?: string): SetLog => ({ sessionId: 1, exerciseId: 'pullup', exerciseName: 'Pull-up', blockIdx: 1, itemIdx: 2, setIdx: 0, reps, assist, loggedAt: '' })

  it('does not count band sets as full reps', () => {
    const rx = prescribe(pullup, scheme, [perf([set(6), set(5), set(8, 'band')])], [])
    expect(rx.note).toMatch(/2 sets without a band \(best 6\), 1 with/)
  })
  it('nudges toward no band when every set used one', () => {
    expect(prescribe(pullup, scheme, [perf([set(8, 'medium'), set(8, 'medium')])], []).note).toMatch(/without it, or use a lighter band/)
  })
  it('unassisted history still progresses by reps', () => {
    expect(prescribe(pullup, scheme, [perf([set(6), set(5), set(5)])], []).reps).toBe(6)
  })
})

describe('arms, carries and removed exercises', () => {
  const ctx = (equipment: Equipment[], variant: 'A' | 'B', profile: Profile = DEFAULT_PROFILE): PlanContext => ({ equipment, profile, type: 'strength', variant, history: new Map() })
  const ids = (c: PlanContext) => buildRulesPlan(c).blocks.flatMap((b) => b.items.map((i) => i.exerciseId))
  const myGarage: Equipment[] = [
    { kind: 'barbell', name: 'Bar', barWeight: 45 },
    { kind: 'plates', name: 'Plates', plates: [{ weight: 45, pairs: 2 }, { weight: 25, pairs: 1 }, { weight: 10, pairs: 1 }, { weight: 5, pairs: 1 }, { weight: 2.5, pairs: 1 }] },
    { kind: 'rack', name: 'Rack' },
    { kind: 'bench', name: 'Bench', incline: true },
    { kind: 'landmine', name: 'Landmine' },
    { kind: 'pullup_bar', name: 'Pull-up bar' },
    { kind: 'bands', name: 'Bands', bandLevels: ['light', 'medium', 'heavy'] },
    { kind: 'kettlebells', name: 'KB', weights: [10] },
  ]

  it('both strength days include a biceps and a triceps exercise, within 60 min', () => {
    for (const v of ['A', 'B'] as const) {
      const plan = buildRulesPlan(ctx(myGarage, v))
      const pats = plan.blocks.flatMap((b) => b.items.map((i) => EXERCISE_BY_ID.get(i.exerciseId)!.pattern))
      expect(pats).toContain('biceps')
      expect(pats).toContain('triceps')
      expect(plan.estimatedMinutes).toBeLessThanOrEqual(60)
    }
  })
  it('varies arm exercises between A and B when there are options', () => {
    const arm = (v: 'A' | 'B') => ids(ctx(myGarage, v)).filter((i) => ['biceps', 'triceps'].includes(EXERCISE_BY_ID.get(i)!.pattern))
    expect(arm('A')).not.toEqual(arm('B'))
  })
  it('barbell curls use an accessory rep range, not 3 × 5', () => {
    const curl = buildRulesPlan(ctx(myGarage, 'A')).blocks[2].items.find((i) => i.exerciseId === 'bb_curl')!
    expect(curl.repsMax).toBe(12)
  })
  it('skips farmer carries with a 10 lb kettlebell', () => {
    for (const v of ['A', 'B'] as const) expect(ids(ctx(myGarage, v))).not.toContain('kb_farmer_carry')
    const heavy = [...myGarage, { kind: 'kettlebells', name: 'KB2', weights: [35, 53] } as Equipment]
    const roomy = { ...DEFAULT_PROFILE, sessionMinutes: 60, sessionMaxMinutes: 90 }
    expect(ids(ctx(heavy, 'B', roomy))).toContain('kb_farmer_carry')
  })
  it('removed exercises are never suggested, and something else takes their place', () => {
    const profile = { ...DEFAULT_PROFILE, excludedExercises: ['bb_curl', 'wu_inchworm', 'bb_back_squat'] }
    const a = ids(ctx(myGarage, 'A', profile))
    expect(a).not.toContain('bb_curl')
    expect(a).not.toContain('wu_inchworm')
    expect(a).not.toContain('bb_back_squat')
    expect(a).toContain('band_curl')
    expect(a).toContain('lm_squat')
  })
})

describe('logging accuracy', () => {
  const dl = EXERCISE_BY_ID.get('bb_deadlift')!
  const loads = barbellLoads(garage)
  const s = (weight: number, reps: number, rpe: number, warmup = false): SetLog =>
    ({ sessionId: 1, exerciseId: 'bb_deadlift', exerciseName: 'DL', blockIdx: 1, itemIdx: 0, setIdx: 0, weight, reps, rpe, warmup, loggedAt: '' })

  it('your deadlift day: 10 reps at 155 when 5 were planned jumps to ~170, not +10', () => {
    const rx = prescribe(dl, { sets: 3, reps: 5 }, [perf([s(135, 10, 7.5), s(155, 10, 9), s(155, 10, 9)])], loads)
    expect(rx.targetWeight).toBe(170)
    expect(rx.note).toMatch(/too light/)
  })
  it('warm-up sets are ignored when judging the session', () => {
    // 3 working sets of 5 at 135 plus two warm-ups: a clean session, so +10
    const rx = prescribe(dl, { sets: 3, reps: 5 }, [perf([s(45, 8, 6, true), s(95, 5, 6, true), s(135, 5, 8), s(135, 5, 8), s(135, 5, 8)])], loads)
    expect(rx.targetWeight).toBe(145)
  })
  it('a session of only warm-up sets is skipped', () => {
    const h = [perf([s(45, 8, 6, true)], daysAgo(1)), perf([s(135, 5, 8), s(135, 5, 8), s(135, 5, 8)], daysAgo(4))]
    expect(prescribe(dl, { sets: 3, reps: 5 }, h, loads).targetWeight).toBe(145)
  })
  it('extra sets beyond the plan still count', () => {
    expect(prescribe(dl, { sets: 3, reps: 5 }, [perf([s(135, 5, 8), s(135, 5, 8), s(135, 5, 8), s(135, 5, 9)])], loads).targetWeight).toBe(145)
  })
  it('after more than 3 weeks off, eases back in at ~90%', () => {
    const rx = prescribe(dl, { sets: 3, reps: 5 }, [perf([s(170, 5, 8), s(170, 5, 8), s(170, 5, 8)], daysAgo(30))], loads)
    expect(rx.targetWeight).toBe(150)
    expect(rx.note).toMatch(/weeks since/)
  })
})

describe('twice-a-week legs', () => {
  const ctx = (variant: 'A' | 'B', equipment: Equipment[] = garage): PlanContext => ({ equipment, profile: DEFAULT_PROFILE, type: 'strength', variant, history: new Map() })
  const mainIds = (v: 'A' | 'B', eq?: Equipment[]) => buildRulesPlan(ctx(v, eq)).blocks[1].items.map((i) => i.exerciseId)

  it('day A has squat + a lighter hinge; day B has deadlift + a lighter squat', () => {
    expect(mainIds('A')).toEqual(['bb_back_squat', 'bb_bench', 'bb_rdl', 'bb_row'])
    expect(mainIds('B')[0]).toBe('bb_deadlift')
    expect(EXERCISE_BY_ID.get(mainIds('B')[2])!.pattern).toBe('squat')
  })
  it('secondary lifts use 2 × 6–10, and both days stay within 60 min', () => {
    const rdl = buildRulesPlan(ctx('A')).blocks[1].items.find((i) => i.exerciseId === 'bb_rdl')!
    expect([rdl.sets, rdl.reps, rdl.repsMax]).toEqual([2, 6, 10])
    for (const v of ['A', 'B'] as const) expect(buildRulesPlan(ctx(v)).estimatedMinutes).toBeLessThanOrEqual(60)
  })
  it('a 10 lb kettlebell is too light for goblet squats; falls back to split squats', () => {
    const eq: Equipment[] = [{ kind: 'pullup_bar', name: 'Bar' }, { kind: 'kettlebells', name: 'KB', weights: [10] }]
    expect(mainIds('A', eq)[0]).toBe('bw_split_squat')
  })
})

describe('plate calculator & warm-up weights', () => {
  it('loads each side, biggest plates first', () => {
    expect(platesFor(155, 'barbell', garage)).toEqual([45, 10])
    expect(platesFor(160, 'barbell', garage)).toEqual([45, 10, 2.5])
    expect(platesFor(45, 'barbell', garage)).toEqual([])
    expect(platesFor(47.5, 'barbell', garage)).toBeNull()
    expect(describePlates(225, 'barbell', garage)).toBe('Each side: 45 + 45')
    expect(describePlates(25, 'landmine', [...garage, { kind: 'landmine', name: 'L' }])).toBe('On the end: 10 + 10 + 5')
  })
  it('first lift shows real ramp-up weights once there is a target', () => {
    const history = new Map([['bb_back_squat', [perf([135, 135, 135].map((w) => ({ sessionId: 1, exerciseId: 'bb_back_squat', exerciseName: 'Squat', blockIdx: 1, itemIdx: 0, setIdx: 0, weight: w, reps: 5, rpe: 8, loggedAt: '' })))]]])
    const plan = buildRulesPlan({ equipment: garage, profile: DEFAULT_PROFILE, type: 'strength', variant: 'A', history })
    expect(plan.blocks[1].items[0].targetWeight).toBe(145)
    expect(plan.blocks[1].items[0].cue).toMatch(/45 × 8 · 80 × 5 · 80 × 3|45 × 8 · 80 × 5/)
  })
})
