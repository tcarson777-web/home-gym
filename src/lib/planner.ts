// Rule-based session builder. This is the "backbone" of the hybrid plan:
// it picks exercises you can do and progresses weights with fixed rules.
// The AI generator (v0.2) will start from this and adjust it; this also
// serves as the offline fallback.

import { capabilities, loadsFor, type Loading } from './equipment'
import { canDo, EXERCISES, EXERCISE_BY_ID, type Exercise, type Pattern } from './exercises'
import { prescribe, type Performance, type Scheme } from './progression'
import type { Equipment, Plan, PlanBlock, PlanItem, Profile, RecoverySignals, SessionType } from './types'

export interface PlanContext {
  equipment: Equipment[]
  profile: Profile
  type: SessionType
  variant: 'A' | 'B'
  history: Map<string, Performance[]> // exerciseId -> performances, newest first
  recovery?: RecoverySignals | null // not used by the rules yet; reserved for Fitbit
}

function makePicker(equipment: Equipment[]) {
  const caps = capabilities(equipment)
  const loadCache = new Map<Loading, number[]>()
  const loads = (l: Loading) => {
    if (!loadCache.has(l)) loadCache.set(l, loadsFor(l, equipment))
    return loadCache.get(l)!
  }
  const available = (ex: Exercise) => canDo(ex, caps, (l) => loads(l).length > 0)
  const pick = (pattern: Pattern, exclude: string[] = []) =>
    EXERCISES.find((e) => e.pattern === pattern && available(e) && !exclude.includes(e.id))
  return { pick, loads, available }
}

function timeItem(id: string, seconds: number, opts: Partial<PlanItem> = {}): PlanItem {
  const ex = EXERCISE_BY_ID.get(id)!
  return { exerciseId: id, name: ex.name, kind: 'time', sets: 1, seconds, restSec: 0, cue: ex.cue, ...opts }
}

/** Rough minutes for a block list, including rest, setup and transitions. */
export function estimateMinutes(blocks: PlanBlock[]): number {
  let sec = 0
  for (const b of blocks) {
    for (const it of b.items) {
      const sides = it.perSide ? 2 : 1
      const work = it.kind === 'time' ? (it.seconds ?? 30) * sides : ((it.repsMax ?? it.reps ?? 8) * 4 + 10) * sides
      sec += it.sets * work + Math.max(0, it.sets - 1) * it.restSec
      sec += it.isMainLift ? 150 : it.kind === 'time' ? 15 : 45 // ramp-up sets / transitions
    }
  }
  return Math.round(sec / 60)
}

function schemeFor(ex: Exercise, main: boolean): { scheme: Scheme; rest: number } {
  if (ex.loading === 'barbell') {
    const sets = ex.id === 'bb_deadlift' ? 2 : 3
    return { scheme: { sets, reps: 5 }, rest: ex.lowerBody ? 180 : 150 }
  }
  if (ex.loading === 'dumbbell' || ex.loading === 'kettlebell' || ex.loading === 'landmine') {
    return main ? { scheme: { sets: 3, reps: 6, repsMax: 10 }, rest: 120 } : { scheme: { sets: 2, reps: 8, repsMax: 12 }, rest: 75 }
  }
  return main ? { scheme: { sets: 3, reps: 5, repsMax: 15 }, rest: 90 } : { scheme: { sets: 2, reps: 8, repsMax: 15 }, rest: 60 }
}

function liftItem(ex: Exercise, main: boolean, ctx: PlanContext, loads: number[], extraSets = 0): PlanItem {
  const { scheme, rest } = schemeFor(ex, main)
  scheme.sets += extraSets
  const rx = prescribe(ex, scheme, ctx.history.get(ex.id) ?? [], loads)
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
    isMainLift: main,
    cue: `${rx.note} ${ex.cue}`,
  }
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
  const { pick, loads, available } = makePicker(ctx.equipment)
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
    mains.push(liftItem(ex, true, ctx, loads(ex.loading), extra))
  })
  if (mains[0]) mains[0].cue = `Warm-up sets first: light × 8, ~60% × 5, ~80% × 3. ${mains[0].cue}`

  const accessoryPatterns: Pattern[] = ctx.variant === 'A' ? ['single_leg', 'core', 'carry'] : ['carry', 'core', 'single_leg']
  const accessories: PlanItem[] = []
  for (const p of accessoryPatterns) {
    // Vary core work between days: A gets the landmine rotation or plank, B something else.
    const ex = pick(p, [...used, ...(ctx.variant === 'B' ? ['plank', 'lm_rotation'] : ['side_plank'])])
    if (!ex) continue
    used.push(ex.id)
    if (ex.pattern === 'core' && ex.loading === 'bodyweight' && ex.id !== 'hanging_knee_raise') {
      accessories.push(timeItem(ex.id, ex.id === 'side_plank' ? 30 : 40, { sets: 3, restSec: 45, perSide: ex.id === 'side_plank' }))
    } else if (ex.pattern === 'carry') {
      const l = loads(ex.loading)
      accessories.push(timeItem(ex.id, 40, { sets: 3, restSec: 60, targetWeight: l[Math.floor(l.length * 0.6)] }))
    } else {
      accessories.push(liftItem(ex, false, ctx, loads(ex.loading)))
    }
  }

  const blocks: PlanBlock[] = [strengthWarmup(available), { name: 'Main lifts', items: mains }, { name: 'Accessories', items: accessories }]

  // Fit the time budget: drop accessories, then trim sets.
  const budget = ctx.profile.sessionMinutes
  // Over budget? Drop carries first, then single-leg work; keep core.
  for (const pattern of ['carry', 'single_leg'] as Pattern[]) {
    const idx = accessories.findIndex((it) => EXERCISE_BY_ID.get(it.exerciseId)?.pattern === pattern)
    if (estimateMinutes(blocks) > budget && idx >= 0 && accessories.length > 1) accessories.splice(idx, 1)
  }
  while (estimateMinutes(blocks) > budget && accessories.length > 1) accessories.pop()
  for (const it of [...accessories].reverse()) if (estimateMinutes(blocks) > budget && it.sets > 2) it.sets--
  const lastMain = mains[mains.length - 1]
  if (lastMain && estimateMinutes(blocks) > budget && lastMain.sets > 2) lastMain.sets--

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
  const { available } = makePicker(ctx.equipment)
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
      name: 'Core circuit (3 rounds)',
      items: [
        timeItem('dead_bug', 40, { sets: 3, restSec: 20 }),
        timeItem('bird_dog', 40, { sets: 3, restSec: 20 }),
        timeItem('side_plank', 25, { sets: 3, restSec: 20, perSide: true }),
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
  return ctx.type === 'mobility' ? buildMobility(ctx) : buildStrength(ctx)
}
