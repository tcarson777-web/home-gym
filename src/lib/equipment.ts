import type { Equipment, EquipmentKind } from './types'

// What a piece of equipment lets you do. Exercises declare which of these they need.
export type Capability =
  | 'dumbbell'
  | 'barbell'
  | 'plates'
  | 'kettlebell'
  | 'bench'
  | 'incline_bench'
  | 'rack'
  | 'pullup_bar'
  | 'band'
  | 'mat'
  | 'box'
  | 'rings'
  | 'jump_rope'
  | 'cardio'

export const KIND_INFO: Record<EquipmentKind, { label: string; emoji: string; provides: Capability[] }> = {
  adjustable_dumbbells: { label: 'Adjustable dumbbells', emoji: '🏋️', provides: ['dumbbell'] },
  fixed_dumbbells: { label: 'Fixed dumbbells', emoji: '🏋️', provides: ['dumbbell'] },
  barbell: { label: 'Barbell', emoji: '➖', provides: ['barbell'] },
  plates: { label: 'Weight plates', emoji: '⚫', provides: ['plates'] },
  kettlebells: { label: 'Kettlebells', emoji: '🔔', provides: ['kettlebell'] },
  bench: { label: 'Bench', emoji: '🪑', provides: ['bench'] },
  rack: { label: 'Squat rack / stands', emoji: '🏗️', provides: ['rack'] },
  pullup_bar: { label: 'Pull-up bar', emoji: '🔝', provides: ['pullup_bar'] },
  bands: { label: 'Resistance bands', emoji: '🎗️', provides: ['band'] },
  mat: { label: 'Yoga / floor mat', emoji: '🧘', provides: ['mat'] },
  box: { label: 'Plyo box / step', emoji: '📦', provides: ['box'] },
  rings: { label: 'Rings / suspension trainer', emoji: '⭕', provides: ['rings'] },
  jump_rope: { label: 'Jump rope', emoji: '🪢', provides: ['jump_rope'] },
  cardio_machine: { label: 'Bike / rower / treadmill', emoji: '🚴', provides: ['cardio'] },
  other: { label: 'Other', emoji: '🔧', provides: [] },
}

export function capabilities(items: Equipment[]): Set<Capability> {
  const caps = new Set<Capability>()
  for (const e of items) {
    for (const c of KIND_INFO[e.kind].provides) caps.add(c)
    if (e.kind === 'bench' && e.incline) caps.add('incline_bench')
  }
  return caps
}

function uniqSorted(xs: number[]): number[] {
  return [...new Set(xs.map((x) => Math.round(x * 100) / 100))].sort((a, b) => a - b)
}

/** Weights available for ONE dumbbell. */
export function dumbbellLoads(items: Equipment[]): number[] {
  const out: number[] = []
  for (const e of items) {
    if (e.kind === 'adjustable_dumbbells' && e.minWeight != null && e.maxWeight != null) {
      const step = e.increment && e.increment > 0 ? e.increment : 5
      for (let w = e.minWeight; w <= e.maxWeight + 1e-9; w += step) out.push(w)
      out.push(e.maxWeight)
    }
    if (e.kind === 'fixed_dumbbells') out.push(...(e.weights ?? []))
  }
  return uniqSorted(out)
}

export function kettlebellLoads(items: Equipment[]): number[] {
  return uniqSorted(items.filter((e) => e.kind === 'kettlebells').flatMap((e) => e.weights ?? []))
}

/** Every total barbell weight you can build: bar + matching plates on both sides. */
export function barbellLoads(items: Equipment[]): number[] {
  const bars = items.filter((e) => e.kind === 'barbell').map((e) => e.barWeight ?? 45)
  if (bars.length === 0) return []
  const plates = items.filter((e) => e.kind === 'plates').flatMap((e) => e.plates ?? [])
  // All per-side sums, using each plate size at most `pairs` times.
  let sides = new Set<number>([0])
  for (const p of plates) {
    const next = new Set<number>()
    for (const s of sides) for (let n = 0; n <= p.pairs; n++) next.add(s + n * p.weight)
    sides = next
  }
  const out: number[] = []
  for (const bar of bars) for (const s of sides) out.push(bar + 2 * s)
  return uniqSorted(out)
}

export type Loading = 'barbell' | 'dumbbell' | 'kettlebell' | 'bodyweight' | 'band'

export function loadsFor(loading: Loading, items: Equipment[]): number[] {
  if (loading === 'barbell') return barbellLoads(items)
  if (loading === 'dumbbell') return dumbbellLoads(items)
  if (loading === 'kettlebell') return kettlebellLoads(items)
  return []
}

/** Closest available load at or below the target (or the lightest one if target is below everything). */
export function roundDown(target: number, loads: number[]): number | undefined {
  if (loads.length === 0) return undefined
  let best = loads[0]
  for (const l of loads) if (l <= target + 1e-9) best = l
  return best
}

export function nextUp(current: number, loads: number[]): number | undefined {
  return loads.find((l) => l > current + 1e-9)
}

export function nextDown(current: number, loads: number[]): number | undefined {
  return [...loads].reverse().find((l) => l < current - 1e-9)
}

export function describeEquipment(e: Equipment): string {
  switch (e.kind) {
    case 'adjustable_dumbbells':
      return `${e.minWeight ?? '?'}–${e.maxWeight ?? '?'} lb in ${e.increment ?? '?'} lb steps`
    case 'fixed_dumbbells':
    case 'kettlebells':
      return e.weights?.length ? `${e.weights.join(', ')} lb` : 'No weights entered'
    case 'barbell':
      return `${e.barWeight ?? 45} lb bar`
    case 'plates':
      return e.plates?.length ? e.plates.map((p) => `${p.pairs}×2 @ ${p.weight}`).join(', ') : 'No plates entered'
    case 'bench':
      return e.incline ? 'Adjustable / incline' : 'Flat'
    case 'bands':
      return e.bandLevels?.length ? e.bandLevels.join(', ') : ''
    default:
      return e.notes ?? ''
  }
}
