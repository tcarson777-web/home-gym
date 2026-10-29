// Answers "is the planner actually using this piece of equipment?" for the Equipment screen.

import { capabilities, KIND_INFO, loadsFor } from './equipment'
import { canDo, EXERCISES, type Exercise } from './exercises'
import { buildRulesPlan } from './planner'
import type { Equipment, Profile } from './types'

export interface Usage {
  inPlans: string[] // exercise names in your upcoming A / B / mobility sessions
  alternatives: string[] // other exercises it makes possible
  warning?: string
}

function relevant(e: Equipment, ex: Exercise): boolean {
  const caps = KIND_INFO[e.kind].provides
  if (ex.requires.some((c) => caps.includes(c))) return true
  if (e.kind === 'plates') return ex.loading === 'barbell' || ex.loading === 'landmine'
  return false
}

export function equipmentUsage(items: Equipment[], profile: Profile): Map<number, Usage> {
  const caps = capabilities(items)
  const doable = (ex: Exercise) => canDo(ex, caps, (l) => loadsFor(l, items).length > 0)
  const base = { equipment: items, profile, history: new Map() }
  const planned = new Set<string>()
  for (const plan of [
    buildRulesPlan({ ...base, type: 'strength', variant: 'A' }),
    buildRulesPlan({ ...base, type: 'strength', variant: 'B' }),
    buildRulesPlan({ ...base, type: 'mobility', variant: 'A' }),
  ])
    for (const b of plan.blocks) for (const it of b.items) planned.add(it.exerciseId)

  const out = new Map<number, Usage>()
  for (const e of items) {
    if (e.id == null) continue
    const exs = EXERCISES.filter((ex) => relevant(e, ex) && doable(ex))
    const usage: Usage = {
      inPlans: exs.filter((ex) => planned.has(ex.id)).map((ex) => ex.name),
      alternatives: exs.filter((ex) => !planned.has(ex.id)).map((ex) => ex.name),
    }
    if (e.kind === 'other') {
      usage.warning = "The built-in planner doesn't know what this is. If its type is in the list, edit it and change the type. The AI coach (coming next) will read its name and notes."
    } else if (e.kind === 'mat') {
      usage.inPlans = ['Floor work: core, yoga, mobility']
    } else if (exs.length === 0) {
      const needs = EXERCISES.filter((ex) => relevant(e, ex)).flatMap((ex) => ex.requires.filter((c) => !caps.has(c)))
      usage.warning = needs.length
        ? `Not usable yet — also needs: ${[...new Set(needs)].join(', ').replace(/_/g, ' ')}.`
        : 'No exercises in the library use this yet.'
    }
    out.set(e.id, usage)
  }
  return out
}
