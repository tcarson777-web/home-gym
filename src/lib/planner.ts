// Rule-based session builder. This is the "backbone" of the hybrid plan:
// it picks exercises you can do and progresses weights with fixed rules.
// The AI generator (v0.2) will start from this and adjust it; this also
// serves as the offline fallback.

import { capabilities, loadsFor, roundDown, type Loading } from './equipment'
import { canDo, EXERCISES, EXERCISE_BY_ID, type Exercise, type Pattern } from './exercises'
import { prescribe, type Performance, type Scheme } from './progression'
import { sessionRange } from './db'
import type { Equipment, Plan, PlanBlock, PlanItem, Profile, RecoverySignals, SessionType } from './types'

export interface PlanContext {
  equipment: Equipment[]
  profile: Profile
  type: SessionType
  variant: 'A' | 'B'
  history: Map<string, Performance[]> // exerciseId -> performances, newest first
  recovery?: RecoverySignals | null // not used by the rules yet; reserved for Fitbit
  now?: number // for tests; defaults to the current time
}

// Carries are pointless with light weights: require at least this per hand.
const MIN_CARRY_LB = 35
// Dumbbell / kettlebell lifts need weights heavy enough to matter (heaviest you own).
const MIN_FREE_WEIGHT_LB = { lower: 25, upper: 10 }

export type Role = 'main' | 'secondary' | 'accessory'

function makePicker(equipment: Equipment[], excluded: string[] = []) {
  const caps = capabilities(equipment)
  const loadCache = new Map<Loading, number[]>()
  const loads = (l: Loading) => {
    if (!loadCache.has(l)) loadCache.set(l, loadsFor(l, equipment))
    return loadCache.get(l)!
  }
  const available = (ex: Exercise) =>
    !excluded.includes(ex.id) &&
    canDo(ex, caps, (l) => loads(l).length > 0) &&
    (ex.pattern !== 'carry' || Math.max(0, ...loads(ex.loading)) >= MIN_CARRY_LB) &&
    (ex.pattern === 'carry' ||
      (ex.loading !== 'dumbbell' && ex.loading !== 'kettlebell') ||
      Math.max(0, ...loads(ex.loading)) >= (ex.lowerBody ? MIN_FREE_WEIGHT_LB.lower : MIN_FREE_WEIGHT_LB.upper))
  const pick = (pattern: Pattern, exclude: string[] = []) =>
    EXERCISES.find((e) => e.pattern === pattern && available(e) && !exclude.includes(e.id))
  return { pick, loads, available }
}

function timeItem(id: string, seconds: number, opts: Partial<PlanItem> = {}): PlanItem {
  const ex = EXERCISE_BY_ID.get(id)!
  const item: PlanItem = { exerciseId: id, name: ex.name, kind: 'time', sets: 1, seconds, restSec: 0, cue: ex.cue, ...opts }
  // Left/right moves: one side per set, so an even number of sets (R, L, R, L).
  if (ex.alternating) {
    item.alternating = true
    item.perSide = false
    if (item.sets % 2) item.sets += 1
  }
  return item
}

/** Rough minutes for a block list, including rest, setup and transitions. */
export function estimateMinutes(blocks: PlanBlock[]): number {
  let sec = 0
  for (const b of blocks) {
    for (const it of b.items) {
      if (it.skipped) continue
      const sides = it.perSide ? 2 : 1
      const work = it.kind === 'time' ? (it.seconds ?? 30) * sides : ((it.repsMax ?? it.reps ?? 8) * 4 + 10) * sides
      sec += it.sets * work + Math.max(0, it.sets - 1) * it.restSec
      sec += it.isMainLift ? 150 : it.kind === 'time' ? 15 : 45 // ramp-up sets / transitions
    }
  }
  return Math.round(sec / 60)
}

// Sets, reps and rest by role. Main = heavy strength work; secondary = the day's lighter
// second leg lift; accessory = arms, single-leg, etc.
function schemeFor(ex: Exercise, role: Role): { scheme: Scheme; rest: number } {
  if (ex.loading === 'barbell' && role === 'main') {
    const sets = ex.id === 'bb_deadlift' ? 2 : 3
    return { scheme: { sets, reps: 5 }, rest: ex.lowerBody ? 180 : 150 }
  }
  const bodyweight = ex.loading === 'bodyweight' || ex.loading === 'band'
  if (role === 'main') return bodyweight ? { scheme: { sets: 3, reps: 5, repsMax: 15 }, rest: 90 } : { scheme: { sets: 3, reps: 6, repsMax: 10 }, rest: 120 }
  if (role === 'secondary') return bodyweight ? { scheme: { sets: 2, reps: 8, repsMax: 15 }, rest: 90 } : { scheme: { sets: 2, reps: 6, repsMax: 10 }, rest: 120 }
  return bodyweight ? { scheme: { sets: 2, reps: 8, repsMax: 15 }, rest: 60 } : { scheme: { sets: 2, reps: 8, repsMax: 12 }, rest: 75 }
}

function liftItem(ex: Exercise, role: Role, ctx: PlanContext, loads: number[], extraSets = 0): PlanItem {
  const { scheme, rest } = schemeFor(ex, role)
  scheme.sets += extraSets
  const rx = prescribe(ex, scheme, ctx.history.get(ex.id) ?? [], loads, ctx.now)
  return {
    exerciseId: ex.id,
    name: ex.name,
    kind: 'reps',
    sets: scheme.sets,
    reps: rx.reps,
    repsMax: rx.repsMax,
    targetWeight: rx.targetWeight,
    restSec: rest,
    perSide: /per (arm|leg|side)/i.test(ex.cue),
    isMainLift: role === 'main',
    cue: `${rx.note} ${ex.cue}`,
  }
}

/** Ramp-up sets in real weights, e.g. "Warm-up (don't log, or mark as Warm-up): 45 × 8 · 95 × 5 · 125 × 3". */
function warmupCue(it: PlanItem, loads: number[], first: boolean): string {
  const t = it.targetWeight
  if (t == null || loads.length === 0) {
    return first ? 'Warm up first: empty bar × 8, then 2–3 jumps up to your working weight. ' : 'Warm up with 1–2 lighter sets first. '
  }
  const steps = (first ? [[0, 8], [0.6, 5], [0.8, 3]] : [[0.6, 5], [0.8, 2]]).map(([pct, reps]) => [pct === 0 ? loads[0] : (roundDown(t * pct, loads) ?? loads[0]), reps])
  const seen = new Set<number>()
  const sets = steps.filter(([w]) => w < t && !seen.has(w) && seen.add(w))
  if (sets.length === 0) return ''
  return `Warm-up sets (mark them "Warm-up" when logging): ${sets.map(([w, r]) => `${w} × ${r}`).join(' · ')}. `
}

function strengthWarmup(available: (e: Exercise) => boolean): PlanBlock {
  const has = (id: string) => available(EXERCISE_BY_ID.get(id)!)
  const cardio = ['wu_cardio', 'wu_rope', 'wu_jacks'].find(has)!
  return {
    name: 'Warm-up',
    items: [
      timeItem(cardio, 180),
      timeItem('wu_cat_cow', 45),
      timeItem('wu_wgs', 60, { perSide: true, seconds: 30 }),
      timeItem('wu_inchworm', 45),
      timeItem('wu_glute_bridge', 45),
      timeItem('wu_bw_squat', 45),
      timeItem(has('wu_band_pullapart') ? 'wu_band_pullapart' : 'wu_arm_circles', 45),
    ],
  }
}

function buildStrength(ctx: PlanContext): Plan {
  const { pick, loads, available } = makePicker(ctx.equipment, ctx.profile.excludedExercises)
  const notes: string[] = []
  const patterns: Pattern[] = ctx.variant === 'A' ? ['squat', 'hpush', 'hpull'] : ['hinge', 'vpush', 'vpull']

  const mains: PlanItem[] = []
  const used: string[] = []
  patterns.forEach((p, i) => {
    let ex = pick(p, used)
    if (!ex && p === 'vpull') ex = pick('hpull', used)
    if (!ex) {
      notes.push(`No ${p === 'hpull' || p === 'vpull' ? 'pulling' : p} exercise fits your equipment — a band or pull-up bar would fix this.`)
      return
    }
    used.push(ex.id)
    const extra = i === 0 && (ctx.profile.experience === '1to3' || ctx.profile.experience === 'over3') ? 1 : 0
    mains.push(liftItem(ex, 'main', ctx, loads(ex.loading), extra))
  })

  // Train a squat AND a hinge every strength day, so each leg pattern gets 2 sessions a week:
  // day A adds a lighter hinge (RDL), day B a lighter squat. Goes third, before the pull.
  const secondary = ctx.variant === 'A' ? pick('hinge', [...used, 'bb_deadlift']) : pick('squat', [...used, 'bb_back_squat'])
  if (secondary) {
    used.push(secondary.id)
    mains.splice(Math.min(2, mains.length), 0, liftItem(secondary, 'secondary', ctx, loads(secondary.loading)))
  }

  // Ramp-up sets in real weights for barbell lifts.
  mains.forEach((m, i) => {
    const ex = EXERCISE_BY_ID.get(m.exerciseId)!
    if (ex.loading === 'barbell' && m.isMainLift) m.cue = warmupCue(m, loads('barbell'), i === 0) + m.cue
  })

  // Accessories, in the order you do them: legs, arms (biceps + triceps), core, carry.
  const accessoryPatterns: Pattern[] = ['single_leg', 'biceps', 'triceps', 'core', 'carry']
  const accessories: PlanItem[] = []
  for (const p of accessoryPatterns) {
    // Vary between days: A gets the landmine rotation or plank, B a different core move;
    // B uses the second-choice arm exercise when there is one.
    const dayExclusions = ctx.variant === 'B' ? ['plank', 'lm_rotation'] : ['side_plank']
    let ex = pick(p, [...used, ...dayExclusions])
    if (ex && ctx.variant === 'B' && (p === 'biceps' || p === 'triceps')) ex = pick(p, [...used, ex.id]) ?? ex
    if (!ex) continue
    used.push(ex.id)
    if (ex.pattern === 'core' && ex.loading === 'bodyweight' && ex.id !== 'hanging_knee_raise') {
      accessories.push(timeItem(ex.id, ex.id === 'side_plank' ? 30 : 40, { sets: 3, restSec: 45 }))
    } else if (ex.pattern === 'carry') {
      const l = loads(ex.loading)
      accessories.push(timeItem(ex.id, 40, { sets: 3, restSec: 60, targetWeight: l[Math.floor(l.length * 0.6)] }))
    } else {
      accessories.push(liftItem(ex, 'accessory', ctx, loads(ex.loading)))
    }
  }

  const blocks: PlanBlock[] = [strengthWarmup(available), { name: 'Main lifts', items: mains }, { name: 'Accessories', items: accessories }]

  // Fit the time range: never over the longest, topped up if under the shortest.
  const { min, max: budget } = sessionRange(ctx.profile)
  // Over budget? Drop in this order: carry, single-leg, triceps, biceps. Core stays.
  for (const pattern of ['carry', 'single_leg', 'triceps', 'biceps'] as Pattern[]) {
    const idx = accessories.findIndex((it) => EXERCISE_BY_ID.get(it.exerciseId)?.pattern === pattern)
    if (estimateMinutes(blocks) > budget && idx >= 0 && accessories.length > 1) accessories.splice(idx, 1)
  }
  while (estimateMinutes(blocks) > budget && accessories.length > 1) accessories.pop()
  for (const it of [...accessories].reverse()) if (estimateMinutes(blocks) > budget && it.sets > 2) it.sets--
  const lastMain = mains[mains.length - 1]
  if (lastMain && estimateMinutes(blocks) > budget && lastMain.sets > 2) lastMain.sets--

  // Under the shortest time? Add accessory sets, then an extra core exercise.
  for (const it of accessories) {
    while (estimateMinutes(blocks) < min && it.sets < 3) {
      it.sets++
      if (estimateMinutes(blocks) > budget) {
        it.sets--
        break
      }
    }
  }
  if (estimateMinutes(blocks) < min) {
    const extra = pick('core', [...used, 'hanging_knee_raise', 'lm_rotation'])
    if (extra) {
      const item = timeItem(extra.id, extra.id === 'side_plank' ? 30 : 40, { sets: 3, restSec: 45 })
      accessories.push(item)
      if (estimateMinutes(blocks) > budget) accessories.pop()
    }
  }

  return {
    title: `Strength ${ctx.variant}: ${mains.map((m) => m.name.replace(/^(Barbell|Dumbbell|Kettlebell) /, '')).join(' · ')}`,
    type: 'strength',
    variant: ctx.variant,
    estimatedMinutes: estimateMinutes(blocks),
    blocks,
    coachNote: notes.join(' ') || undefined,
    source: 'rules',
  }
}

function buildMobility(ctx: PlanContext): Plan {
  const { available } = makePicker(ctx.equipment, ctx.profile.excludedExercises)
  const has = (id: string) => available(EXERCISE_BY_ID.get(id)!)
  const cardio = ['wu_cardio', 'wu_rope', 'wu_jacks'].find(has)!
  const blocks: PlanBlock[] = [
    {
      name: 'Warm-up',
      items: [
        timeItem('yoga_breath', 90),
        timeItem('wu_cat_cow', 60),
        timeItem(cardio, 150),
        timeItem('wu_wgs', 45, { perSide: true }),
        timeItem('wu_arm_circles', 45),
        timeItem('yoga_sun_salute', 120),
      ],
    },
    {
      name: 'Yoga flow',
      items: [
        timeItem('yoga_sun_salute', 150),
        timeItem('yoga_down_dog', 60),
        timeItem('yoga_low_lunge', 60, { perSide: true }),
        timeItem('yoga_warrior2', 45, { perSide: true }),
        timeItem('yoga_triangle', 45, { perSide: true }),
        timeItem('yoga_pigeon', 75, { perSide: true }),
        timeItem('yoga_childs', 60),
      ],
    },
    {
      name: 'Core',
      items: [
        timeItem('dead_bug', 40, { sets: 3, restSec: 20 }),
        timeItem('bird_dog', 40, { sets: 3, restSec: 20 }),
        timeItem('side_plank', 25, { sets: 3, restSec: 20 }),
        timeItem('hollow_hold', 25, { sets: 3, restSec: 30 }),
      ],
    },
    {
      name: 'Mobility & cool-down',
      items: [
        timeItem('mob_90_90', 90),
        timeItem('mob_thoracic', 45, { perSide: true }),
        timeItem('mob_couch', 45, { perSide: true }),
        timeItem('mob_hamstring', 45, { perSide: true }),
        timeItem(has('mob_dead_hang') ? 'mob_dead_hang' : 'mob_deep_squat', 45, { sets: 2, restSec: 30 }),
        timeItem('yoga_childs', 60),
      ],
    },
  ]
  return { title: 'Yoga, core & mobility', type: 'mobility', estimatedMinutes: estimateMinutes(blocks), blocks, source: 'rules' }
}

export function buildRulesPlan(ctx: PlanContext): Plan {
  const plan = ctx.type === 'mobility' ? buildMobility(ctx) : buildStrength(ctx)
  // Warm-up and mobility moves are fixed lists, so remove anything you've excluded here.
  const excluded = new Set(ctx.profile.excludedExercises ?? [])
  if (excluded.size) {
    for (const b of plan.blocks) b.items = b.items.filter((it) => !excluded.has(it.exerciseId))
    plan.blocks = plan.blocks.filter((b) => b.items.length > 0)
    plan.estimatedMinutes = estimateMinutes(plan.blocks)
  }
  return plan
}

// Patterns that count as the same "slot" when swapping.
const SWAP_GROUPS: Pattern[][] = [['hpull', 'vpull']]
// Floor / stretch moves are done for time; everything else for reps.
const TIMED_PATTERNS: Pattern[] = ['core', 'warmup', 'yoga', 'mobility']

/**
 * Exercises that could replace `item` today: same movement type, fits your equipment,
 * not removed by you and not already in the plan. Same role (main / secondary / accessory).
 */
export function swapOptions(item: PlanItem, blockName: string, ctx: PlanContext, inPlan: Set<string>): PlanItem[] {
  const ex = EXERCISE_BY_ID.get(item.exerciseId)
  if (!ex) return []
  const { available, loads } = makePicker(ctx.equipment, ctx.profile.excludedExercises)
  const patterns = SWAP_GROUPS.find((g) => g.includes(ex.pattern)) ?? [ex.pattern]
  const role: Role = item.isMainLift ? 'main' : blockName === 'Main lifts' ? 'secondary' : 'accessory'
  return EXERCISES.filter((e) => patterns.includes(e.pattern) && e.id !== ex.id && !inPlan.has(e.id) && available(e))
    .slice(0, 8)
    .map((e) => {
      const timed = TIMED_PATTERNS.includes(e.pattern) && e.loading === 'bodyweight' && e.id !== 'hanging_knee_raise'
      const next = timed
        ? timeItem(e.id, item.seconds ?? 40, { sets: item.sets, restSec: item.restSec, perSide: /per side/i.test(e.cue) })
        : e.pattern === 'carry'
          ? timeItem(e.id, item.seconds ?? 40, { sets: item.sets, restSec: item.restSec, targetWeight: loads(e.loading)[Math.floor(loads(e.loading).length * 0.6)] })
          : liftItem(e, role, ctx, loads(e.loading))
      return { ...next, swappedFrom: item.swappedFrom ?? item.name }
    })
}
