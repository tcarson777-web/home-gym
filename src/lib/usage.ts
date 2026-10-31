// Answers "is the planner actually using this piece of equipment — and if not, why?"
// for the Equipment screen.

import { capabilities, KIND_INFO, loadsFor, type Capability, type Loading } from './equipment'
import { canDo, EXERCISES, type Exercise } from './exercises'
import { buildRulesPlan } from './planner'
import type { Equipment, EquipmentKind, Profile } from './types'

export interface Usage {
  inPlans: string[] // exercise names in your upcoming A / B / mobility sessions
  alternatives: string[] // other exercises it makes possible
  warning?: string
}

// Friendly names for what an exercise needs.
const NEED_LABEL: Record<Capability, string> = {
  dumbbell: 'Dumbbells',
  barbell: 'Barbell',
  plates: 'Weight plates',
  kettlebell: 'Kettlebells',
  bench: 'Bench',
  incline_bench: 'Incline bench',
  rack: 'Squat rack / stands',
  pullup_bar: 'Pull-up bar',
  band: 'Resistance bands',
  mat: 'Mat',
  box: 'Box / step',
  rings: 'Rings / suspension trainer',
  jump_rope: 'Jump rope',
  cardio: 'Bike / rower / treadmill',
  landmine: 'Landmine attachment',
}

const LOADING_CAP: Partial<Record<Loading, Capability>> = { dumbbell: 'dumbbell', kettlebell: 'kettlebell', barbell: 'barbell', landmine: 'landmine' }

// Order matters: more specific names first ("pull-up bar" before "bar").
const KIND_GUESSES: [EquipmentKind, RegExp][] = [
  ['pullup_bar', /pull.?up|chin.?up/i],
  ['landmine', /landmine|t.?bar/i],
  ['adjustable_dumbbells', /dumb.?bell|\bdbs?\b/i],
  ['kettlebells', /kettle|\bkbs?\b/i],
  ['plates', /plate/i],
  ['rack', /rack|stands?\b|cage/i],
  ['bench', /bench/i],
  ['barbell', /bar.?bell|olympic|\bbar\b/i],
  ['bands', /band/i],
  ['rings', /\brings?\b|trx|suspension/i],
  ['box', /\bbox\b|step/i],
  ['jump_rope', /rope/i],
  ['cardio_machine', /bike|rower|treadmill|\berg\b/i],
  ['mat', /\bmat\b|yoga/i],
]

/** For items saved as "Other": what they probably are, judging by name and notes. */
export function guessKind(e: Equipment): EquipmentKind | undefined {
  const text = `${e.name} ${e.notes ?? ''}`
  return KIND_GUESSES.find(([, re]) => re.test(text))?.[0]
}

function relevant(e: Equipment, ex: Exercise): boolean {
  const caps = KIND_INFO[e.kind].provides
  if (ex.requires.some((c) => caps.includes(c))) return true
  if (e.kind === 'plates') return ex.loading === 'barbell' || ex.loading === 'landmine'
  return false
}

function missingWeights(e: Equipment): boolean {
  if (e.kind === 'adjustable_dumbbells') return e.minWeight == null || e.maxWeight == null
  if (e.kind === 'fixed_dumbbells' || e.kind === 'kettlebells') return !e.weights?.length
  return false
}

export function equipmentUsage(items: Equipment[], profile: Profile): Map<number, Usage> {
  const caps = capabilities(items)
  const hasLoads = (l: Loading) => loadsFor(l, items).length > 0
  const doable = (ex: Exercise) => canDo(ex, caps, hasLoads)
  const base = { equipment: items, profile, history: new Map() }
  const planned = new Set<string>()
  for (const plan of [
    buildRulesPlan({ ...base, type: 'strength', variant: 'A' }),
    buildRulesPlan({ ...base, type: 'strength', variant: 'B' }),
    buildRulesPlan({ ...base, type: 'mobility', variant: 'A' }),
  ])
    for (const b of plan.blocks) for (const it of b.items) planned.add(it.exerciseId)

  const others = items.filter((e) => e.kind === 'other').map((e) => ({ item: e, guess: guessKind(e) }))

  // Why can't this item be used? Names what's missing, and points at "Other" items that look like it.
  function explain(e: Equipment): string {
    const needSets = new Set<string>()
    const missing = new Set<Capability>()
    for (const ex of EXERCISES.filter((x) => relevant(e, x))) {
      const lacking = ex.requires.filter((c) => !caps.has(c))
      const loadCap = LOADING_CAP[ex.loading]
      // Everything's there but no weights to load (e.g. dumbbells with none entered).
      if (lacking.length === 0 && loadCap && !hasLoads(ex.loading)) lacking.push(loadCap)
      if (lacking.length === 0) continue
      lacking.forEach((c) => missing.add(c))
      needSets.add(lacking.map((c) => NEED_LABEL[c]).join(' + '))
    }
    const unweighted = items.filter((x) => missingWeights(x) && [...missing].some((c) => KIND_INFO[x.kind].provides.includes(c)))
    if (unweighted.length) return `Not usable yet: your ${unweighted.map((x) => x.name).join(', ')} ${unweighted.length > 1 ? 'have' : 'has'} no weights entered. Tap ${unweighted.length > 1 ? 'them' : 'it'} to add the weights.`
    if (needSets.size === 0) return 'No exercises in the library use this yet.'
    const options = [...needSets].sort((a, b) => a.length - b.length).slice(0, 3)
    let msg = `Not usable on its own — it also needs ${options.length > 1 ? 'one of: ' : ''}${options.join(' · ')}. Add it to your list.`
    const lookalike = others.find((o) => o.guess && KIND_INFO[o.guess].provides.some((c) => missing.has(c)))
    if (lookalike) msg += ` Your “${lookalike.item.name}” is saved as Other — if it's a ${KIND_INFO[lookalike.guess!].label}, tap it and change its Type.`
    return msg
  }

  const out = new Map<number, Usage>()
  for (const e of items) {
    if (e.id == null) continue
    const exs = EXERCISES.filter((ex) => relevant(e, ex) && doable(ex))
    const usage: Usage = {
      inPlans: exs.filter((ex) => planned.has(ex.id)).map((ex) => ex.name),
      alternatives: exs.filter((ex) => !planned.has(ex.id)).map((ex) => ex.name),
    }
    if (e.kind === 'other') {
      const guess = guessKind(e)
      usage.warning = guess
        ? `Saved as “Other”, so the planner ignores it. Looks like a ${KIND_INFO[guess].label} — tap it and change its Type.`
        : "Saved as “Other”, so the built-in planner ignores it. If its type is in the list, tap it and change the Type. The AI coach (coming next) will read its name and notes."
    } else if (missingWeights(e)) {
      usage.warning = 'No weights entered, so nothing can use it. Tap it to add the weights you own.'
    } else if (e.kind === 'barbell' && !items.some((x) => x.kind === 'plates' && x.plates?.some((pl) => pl.pairs > 0))) {
      usage.warning = `No weight plates in your list, so it can only be used as an empty ${e.barWeight ?? 45} lb bar. Add “Weight plates” with your pairs.`
    } else if (e.kind === 'mat') {
      usage.inPlans = ['Floor work: core, yoga, mobility']
    } else if (exs.length === 0) {
      usage.warning = explain(e)
    }
    out.set(e.id, usage)
  }
  return out
}
