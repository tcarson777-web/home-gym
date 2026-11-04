import { db, getProfile } from './db'
import { buildRulesPlan, swapOptions } from './planner'
import type { Performance } from './progression'
import type { Plan, PlanItem, Session, SessionType, SetLog } from './types'

/** Monday 00:00 local time of the week containing `d`. */
export function weekStart(d = new Date()): Date {
  const s = new Date(d)
  s.setHours(0, 0, 0, 0)
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7))
  return s
}

export interface WeekStatus {
  done: Session[]
  target: number
  strengthDone: number
  mobilityDone: number
  complete: boolean
  suggested: SessionType
}

export function weekStatus(sessions: Session[], target: number, now = new Date()): WeekStatus {
  const start = weekStart(now).getTime()
  const done = sessions
    .filter((s) => s.status === 'done' && new Date(s.date).getTime() >= start)
    .sort((a, b) => a.date.localeCompare(b.date))
  const strengthDone = done.filter((s) => s.type === 'strength').length
  const mobilityDone = done.filter((s) => s.type === 'mobility').length
  const remaining = target - done.length
  const last = done[done.length - 1]
  // At least one mobility day a week: slot it after a lifting day, or when it's the last chance.
  const needMobility = mobilityDone === 0 && (remaining <= 1 || last?.type === 'strength')
  return {
    done,
    target,
    strengthDone,
    mobilityDone,
    complete: remaining <= 0 && mobilityDone > 0,
    suggested: needMobility ? 'mobility' : 'strength',
  }
}

/** exerciseId -> performances from finished sessions, newest first. */
export async function loadHistory(): Promise<Map<string, Performance[]>> {
  const sessions = await db.sessions.where('status').equals('done').toArray()
  const doneIds = new Map(sessions.map((s) => [s.id!, s]))
  const sets = (await db.sets.toArray()).filter((s) => doneIds.has(s.sessionId))
  const bySession = new Map<string, Map<number, SetLog[]>>()
  for (const set of sets) {
    if (!bySession.has(set.exerciseId)) bySession.set(set.exerciseId, new Map())
    const m = bySession.get(set.exerciseId)!
    if (!m.has(set.sessionId)) m.set(set.sessionId, [])
    m.get(set.sessionId)!.push(set)
  }
  const out = new Map<string, Performance[]>()
  for (const [exId, m] of bySession) {
    const perfs = [...m.entries()].map(([sessionId, s]) => ({ sessionId, date: doneIds.get(sessionId)!.date, sets: s }))
    perfs.sort((a, b) => b.date.localeCompare(a.date))
    out.set(exId, perfs)
  }
  return out
}

/** Build the plan for the next session without starting it (used for the preview). */
export async function buildNextPlan(type: SessionType): Promise<Plan> {
  const [equipment, profile, history, done] = await Promise.all([
    db.equipment.toArray(),
    getProfile(),
    loadHistory(),
    db.sessions.where('status').equals('done').toArray(),
  ])
  const lastStrength = done.filter((s) => s.type === 'strength').sort((a, b) => b.date.localeCompare(a.date))[0]
  const variant = lastStrength?.plan.variant === 'A' ? 'B' : 'A'
  return buildRulesPlan({ equipment, profile, type, variant, history })
}

/** Start a session from the plan the user previewed, so what they saw is what they get. */
export async function startSession(plan: Plan, bonus: boolean): Promise<number> {
  return (await db.sessions.add({ date: new Date().toISOString(), type: plan.type, status: 'in_progress', plan, bonus, checked: [] })) as number
}

/** Alternatives for one exercise in a plan (preview or workout in progress). */
export async function getSwapOptions(plan: Plan, blockIdx: number, itemIdx: number): Promise<PlanItem[]> {
  const [equipment, profile, history] = await Promise.all([db.equipment.toArray(), getProfile(), loadHistory()])
  const block = plan.blocks[blockIdx]
  const inPlan = new Set(plan.blocks.flatMap((b) => b.items.filter((it) => !it.skipped).map((it) => it.exerciseId)))
  return swapOptions(block.items[itemIdx], block.name, { equipment, profile, history, type: plan.type, variant: plan.variant ?? 'A' }, inPlan)
}

/** Stop suggesting an exercise in future plans (undo in Settings). */
export async function excludeExercise(exerciseId: string) {
  const p = await getProfile()
  await db.profile.put({ ...p, excludedExercises: [...new Set([...(p.excludedExercises ?? []), exerciseId])] })
}
