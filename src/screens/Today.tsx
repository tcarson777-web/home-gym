import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import PlanPreview from '../components/PlanPreview'
import SwapSheet from '../components/SwapSheet'
import { db, DEFAULT_PROFILE, sessionRange } from '../lib/db'
import { estimateMinutes } from '../lib/planner'
import { buildNextPlan, excludeExercise, getSwapOptions, startSession, weekStatus } from '../lib/schedule'
import type { Plan, PlanItem, Session, SessionType } from '../lib/types'

interface Props {
  activeSession: Session | undefined
  onOpenWorkout: (id: number) => void
  goTo: (tab: 'equipment' | 'settings') => void
}

const LABEL: Record<SessionType, string> = { strength: '🏋️ Strength', mobility: '🧘 Yoga, core & mobility' }

export default function TodayScreen({ activeSession, onOpenWorkout, goTo }: Props) {
  const sessions = useLiveQuery(() => db.sessions.toArray(), [], [])
  const equipmentCount = useLiveQuery(() => db.equipment.count(), [], 0)
  const profile = useLiveQuery(() => db.profile.get('me'))
  const [busy, setBusy] = useState(false)

  const target = (profile ?? DEFAULT_PROFILE).sessionsPerWeek
  const week = weekStatus(sessions, target)
  const overTarget = week.done.length >= target
  const isBonus = week.complete // the 4th (or later) session once the week's 3 incl. mobility are done
  const [picked, setPicked] = useState<SessionType | null>(null)
  const type = picked ?? week.suggested
  // Re-builds automatically when equipment, profile or history change.
  const basePlan = useLiveQuery(() => buildNextPlan(type), [type])

  // Today's swaps and skips, layered on the generated plan until you start (or reset).
  // Keyed by session type + position; dropped if the generated plan changes underneath.
  const [overrides, setOverrides] = useState<Record<string, { origId: string; item: PlanItem }>>({})
  const [sheet, setSheet] = useState<{ b: number; i: number; options?: PlanItem[] } | null>(null)
  const excluded = profile?.excludedExercises ?? []
  const plan: Plan | undefined = useMemo(() => {
    if (!basePlan) return undefined
    const blocks = basePlan.blocks.map((bl, b) => ({
      ...bl,
      items: bl.items.map((it, i) => {
        const o = overrides[`${type}|${b}:${i}`]
        return o && (it.exerciseId === o.origId || excluded.includes(o.origId)) ? o.item : it
      }),
    }))
    return { ...basePlan, blocks, estimatedMinutes: estimateMinutes(blocks) }
  }, [basePlan, overrides, type, excluded])
  const hasChanges = Object.keys(overrides).some((k) => k.startsWith(`${type}|`))

  const setOverride = (b: number, i: number, item: PlanItem | null) =>
    setOverrides((prev) => {
      const next = { ...prev }
      const k = `${type}|${b}:${i}`
      if (item) next[k] = { origId: prev[k]?.origId ?? basePlan!.blocks[b].items[i].exerciseId, item }
      else delete next[k]
      return next
    })

  function openSwap(b: number, i: number) {
    if (!plan) return
    setSheet({ b, i })
    getSwapOptions(plan, b, i).then((options) => setSheet((cur) => (cur && cur.b === b && cur.i === i ? { ...cur, options } : cur)))
  }

  async function start() {
    if (!plan) return
    setBusy(true)
    try {
      const id = await startSession(plan, isBonus)
      setOverrides((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith(`${type}|`))))
      onOpenWorkout(id)
    } finally {
      setBusy(false)
    }
  }

  const slots = Math.max(target, week.done.length)

  return (
    <div className="stack">
      <div>
        <h1>Today</h1>
        <p className="muted">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </div>

      {equipmentCount === 0 && (
        <button className="notice" style={{ textAlign: 'left' }} onClick={() => goTo('equipment')}>
          Add your garage equipment first so workouts only use what you have. Tap here →
        </button>
      )}
      {!profile && (
        <button className="notice" style={{ textAlign: 'left' }} onClick={() => goTo('settings')}>
          Tell the app about your training experience and any injuries in Settings →
        </button>
      )}

      <div className="card stack">
        <div className="row between">
          <h2>This week</h2>
          <span className="muted small">
            {Math.min(week.done.length, target)} of {target}
            {week.mobilityDone > 0 ? ' · mobility ✓' : ' · mobility needed'}
          </span>
        </div>
        <div className="week">
          {Array.from({ length: slots }, (_, i) => {
            const s = week.done[i]
            return (
              <div key={i} className={`slot ${s ? 'done' : ''} ${s?.bonus ? 'bonus' : ''}`} title={s?.plan.title}>
                {s ? (s.type === 'mobility' ? '🧘' : '🏋️') : ''}
              </div>
            )
          })}
        </div>
      </div>

      {activeSession ? (
        <div className="card active stack">
          <span className="pill accent">In progress</span>
          <h2>{activeSession.plan.title}</h2>
          <button className="btn primary big" onClick={() => onOpenWorkout(activeSession.id!)}>
            Resume workout
          </button>
        </div>
      ) : (
        <div className="card stack">
          {overTarget && (
            <div>
              <h2>{week.complete ? 'Week complete ✅' : `${target} sessions done`}</h2>
              <p className="muted small">
                {week.complete
                  ? 'Nice work. Rest up — or, if you are feeling good, add a bonus session.'
                  : "You haven't done a mobility session yet this week."}
              </p>
            </div>
          )}
          <div className="segmented">
            {(['strength', 'mobility'] as const).map((t) => (
              <button key={t} className={type === t ? 'on' : ''} onClick={() => setPicked(t)}>
                {LABEL[t]}
                {t === week.suggested && !week.complete ? ' ★' : ''}
              </button>
            ))}
          </div>
          {plan ? (
            <>
              <div>
                <span className="muted small">{isBonus ? 'Bonus session' : type === week.suggested ? 'Recommended next' : 'Preview'}</span>
                <h2>{plan.title}</h2>
                <p className="muted small">
                  ~{plan.estimatedMinutes} min, warm-up included · your range {sessionRange(profile ?? DEFAULT_PROFILE).min}–{sessionRange(profile ?? DEFAULT_PROFILE).max}
                </p>
              </div>
              <button className="btn primary big" disabled={busy} onClick={start}>
                {isBonus ? '💪 Start bonus session' : 'Start workout'}
              </button>
              <PlanPreview
                plan={plan}
                onSwap={openSwap}
                onUnskip={(b, i) => {
                  const cur = plan.blocks[b].items[i]
                  setOverride(b, i, cur.swappedFrom ? { ...cur, skipped: false } : null)
                }}
              />
              <p className="muted small center">
                Tap an exercise for details · ⇄ to swap or skip it today
                {hasChanges && (
                  <>
                    {' · '}
                    <button className="btn ghost sm" style={{ minHeight: 0, padding: 0, color: 'var(--accent)' }} onClick={() => setOverrides((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith(`${type}|`))))}>
                      Reset changes
                    </button>
                  </>
                )}
              </p>
              {sheet && (
                <SwapSheet
                  item={plan.blocks[sheet.b].items[sheet.i]}
                  options={sheet.options}
                  onClose={() => setSheet(null)}
                  onSwap={(replacement, never) => {
                    const current = plan.blocks[sheet.b].items[sheet.i]
                    setOverride(sheet.b, sheet.i, replacement)
                    if (never) void excludeExercise(current.exerciseId)
                    setSheet(null)
                  }}
                  onSkip={(never) => {
                    const current = plan.blocks[sheet.b].items[sheet.i]
                    setOverride(sheet.b, sheet.i, { ...current, skipped: true })
                    if (never) void excludeExercise(current.exerciseId)
                    setSheet(null)
                  }}
                />
              )}
            </>
          ) : (
            <p className="muted">Building your workout…</p>
          )}
        </div>
      )}
    </div>
  )
}
