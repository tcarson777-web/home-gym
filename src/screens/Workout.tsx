import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState } from 'react'
import Stepper from '../components/Stepper'
import { alertUser, keepScreenOn, unlockAudio } from '../lib/alerts'
import { db } from '../lib/db'
import { describePlates, isWeighted, loadsFor, nextDown, nextUp } from '../lib/equipment'
import { EXERCISE_BY_ID } from '../lib/exercises'
import { fmtTime as fmt, repsLabel } from '../lib/format'
import Figure from '../components/Figure'
import SwapSheet from '../components/SwapSheet'
import { excludeExercise, getSwapOptions } from '../lib/schedule'
import { FIGURES, howToUrl } from '../lib/figures'
import { EFFORT_OPTIONS, type Equipment, type PlanItem, type Session, type SetLog } from '../lib/types'

const key = (b: number, i: number) => `${b}:${i}`

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [active])
  return now
}

export default function WorkoutScreen({ sessionId, onClose }: { sessionId: number; onClose: () => void }) {
  const session = useLiveQuery(() => db.sessions.get(sessionId), [sessionId])
  const sets = useLiveQuery(() => db.sets.where('sessionId').equals(sessionId).toArray(), [sessionId], [])
  const equipment = useLiveQuery(() => db.equipment.toArray(), [], [])
  // undefined = follow along automatically; null = everything collapsed
  const [activeKey, setActiveKey] = useState<string | null | undefined>(undefined)
  // Saved on the session so the timer survives a reload or leaving the screen.
  const restEndsAt = session?.restEndsAt ?? null
  const setRestEndsAt = (endsAt: number | null) => db.sessions.update(sessionId, { restEndsAt: endsAt })
  const now = useNow(true)
  const [sheet, setSheet] = useState<{ b: number; i: number; options?: PlanItem[] } | null>(null)

  useEffect(() => {
    void keepScreenOn(true)
    const onVis = () => document.visibilityState === 'visible' && keepScreenOn(true)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      void keepScreenOn(false)
    }
  }, [])

  // Rest timer alarm (fires once when it reaches zero).
  const alarmed = useRef<number | null>(null)
  useEffect(() => {
    if (restEndsAt && now >= restEndsAt && alarmed.current !== restEndsAt) {
      alarmed.current = restEndsAt
      // Don't beep for a timer that ran out long ago (e.g. reopening the app later).
      if (now - restEndsAt > 5000) return
      alertUser(2)
    }
  }, [now, restEndsAt])

  const setsByItem = useMemo(() => {
    const m = new Map<string, SetLog[]>()
    for (const s of sets) {
      const k = key(s.blockIdx, s.itemIdx)
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(s)
    }
    for (const list of m.values()) list.sort((a, b) => a.setIdx - b.setIdx)
    return m
  }, [sets])

  if (!session) return <p className="muted">Loading…</p>
  const s: Session = session

  const isComplete = (b: number, i: number, it: PlanItem) =>
    it.skipped ||
    (it.kind === 'reps'
      ? (setsByItem.get(key(b, i)) ?? []).filter((x) => !x.warmup).length >= it.sets
      : Array.from({ length: it.sets }, (_, n) => s.checked.includes(`${key(b, i)}:${n}`)).every(Boolean))

  const order: [number, number][] = s.plan.blocks.flatMap((bl, b) => bl.items.map((_, i) => [b, i] as [number, number]))
  const firstOpen = order.find(([b, i]) => !isComplete(b, i, s.plan.blocks[b].items[i]))
  const current = activeKey === undefined ? (firstOpen ? key(...firstOpen) : null) : activeKey
  const totalItems = order.length
  const doneItems = order.filter(([b, i]) => isComplete(b, i, s.plan.blocks[b].items[i])).length

  // After finishing an item, go back to auto-follow (the first unfinished item).
  const autoFollow = () => setActiveKey(undefined)

  async function toggleCheck(b: number, i: number, n: number) {
    unlockAudio()
    const k = `${key(b, i)}:${n}`
    // Read fresh from the database so fast double-taps don't undo each other.
    await db.transaction('rw', db.sessions, async () => {
      const cur = await db.sessions.get(sessionId)
      if (!cur) return
      const checked = cur.checked.includes(k) ? cur.checked.filter((c) => c !== k) : [...cur.checked, k]
      await db.sessions.update(sessionId, { checked })
    })
    if (activeKey === key(b, i)) setActiveKey(undefined)
  }

  async function finish() {
    if (sets.length === 0 && s.checked.length === 0) {
      if (confirm('Nothing was logged. Discard this workout?')) await discard(true)
      return
    }
    await db.sessions.update(sessionId, { status: 'done', finishedAt: new Date().toISOString() })
    onClose()
  }

  async function discard(skipConfirm = false) {
    if (!skipConfirm && !confirm('Delete this workout and everything logged in it?')) return
    await db.transaction('rw', db.sessions, db.sets, async () => {
      await db.sets.where('sessionId').equals(sessionId).delete()
      await db.sessions.delete(sessionId)
    })
    onClose()
  }

  // Swapping is only offered before you've logged anything for that exercise.
  const started = (b: number, i: number) =>
    (setsByItem.get(key(b, i))?.length ?? 0) > 0 || s.checked.some((c) => c.startsWith(`${key(b, i)}:`))

  async function replaceItem(b: number, i: number, item: PlanItem) {
    await db.transaction('rw', db.sessions, async () => {
      const cur = await db.sessions.get(sessionId)
      if (!cur) return
      const blocks = cur.plan.blocks.map((bl, bb) => (bb === b ? { ...bl, items: bl.items.map((x, ii) => (ii === i ? item : x)) } : bl))
      await db.sessions.update(sessionId, { plan: { ...cur.plan, blocks } })
    })
  }

  function openSwap(b: number, i: number) {
    setSheet({ b, i })
    getSwapOptions(s.plan, b, i).then((options) => setSheet((cur) => (cur && cur.b === b && cur.i === i ? { ...cur, options } : cur)))
  }

  const elapsed = (now - new Date(s.date).getTime()) / 1000
  // Hide a timer that ran out more than 5 minutes ago.
  const restLeft = restEndsAt && now - restEndsAt < 300_000 ? (restEndsAt - now) / 1000 : null

  return (
    <div className="stack" style={{ paddingBottom: restLeft != null ? 120 : 24 }}>
      <div className="header-bar row between">
        <button className="btn ghost sm" onClick={onClose}>‹ Back</button>
        <span className="muted small">⏱ {fmt(elapsed)} · {doneItems}/{totalItems}</span>
        <button className="btn primary sm" onClick={finish}>Finish</button>
      </div>

      <div>
        <h1>{s.plan.title}</h1>
        <p className="muted small">
          ~{s.plan.estimatedMinutes} min{s.bonus ? ' · bonus session 💪' : ''}
        </p>
      </div>
      {s.plan.coachNote && <div className="notice">{s.plan.coachNote}</div>}

      {s.plan.blocks.map((block, b) => (
        <div key={b} className="stack">
          <h2 style={{ marginTop: 8 }}>{block.name}</h2>
          {block.items.map((it, i) => {
            const k = key(b, i)
            const done = isComplete(b, i, it)
            const isActive = current === k
            return (
              it.skipped ? (
                <div key={`${k}:${it.exerciseId}`} className="card row between done">
                  <span>
                    <span className="skipped">{it.name}</span>
                    <span className="muted small" style={{ display: 'block' }}>Skipped today</span>
                  </span>
                  <button className="btn ghost sm" onClick={() => replaceItem(b, i, { ...it, skipped: false })}>Undo</button>
                </div>
              ) : (
              <div key={`${k}:${it.exerciseId}`} className={`card stack ${isActive ? 'active' : ''} ${done && !isActive ? 'done' : ''}`}>
                <button className="row between" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => setActiveKey(isActive ? null : k)}>
                  <div className="grow">
                    <h3>{done ? '✓ ' : ''}{it.name}</h3>
                    <p className="muted small">{repsLabel(it)}{it.swappedFrom ? ` · instead of ${it.swappedFrom}` : ''}</p>
                  </div>
                  {it.restSec > 0 && <span className="pill">rest {fmt(it.restSec)}</span>}
                </button>
                {isActive && <Figure exerciseId={it.exerciseId} size={(FIGURES[it.exerciseId]?.length ?? 0) > 2 ? 72 : 96} />}
                {isActive && it.cue && <p className="small muted">{it.cue}</p>}
                {isActive && (
                  <div className="row between">
                    <a className="small" href={howToUrl(it.name)} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
                      ▶ How to (video)
                    </a>
                    {!started(b, i) && (
                      <button className="btn ghost sm" onClick={() => openSwap(b, i)}>⇄ Swap / skip</button>
                    )}
                  </div>
                )}
                {it.kind === 'time' ? (
                  <TimeItem
                    item={it}
                    checked={(n) => s.checked.includes(`${k}:${n}`)}
                    onToggle={(n) => toggleCheck(b, i, n)}
                    onAllDone={() => autoFollow()}
                    expanded={isActive}
                  />
                ) : (
                  <RepsItem
                    item={it}
                    logged={setsByItem.get(k) ?? []}
                    expanded={isActive}
                    loads={loadsFor(EXERCISE_BY_ID.get(it.exerciseId)?.loading ?? 'bodyweight', equipment)}
                    bandLevels={equipment.filter((e) => e.kind === 'bands').flatMap((e) => e.bandLevels ?? [])}
                    equipment={equipment}
                    onLog={async (weight, reps, rpe, assist, warmup) => {
                      unlockAudio()
                      const n = setsByItem.get(k)?.length ?? 0
                      await db.sets.add({ sessionId, exerciseId: it.exerciseId, exerciseName: it.name, blockIdx: b, itemIdx: i, setIdx: n, weight, reps, rpe, assist, warmup: warmup || undefined, loggedAt: new Date().toISOString() })
                      // Warm-up sets get a short rest; working sets the planned one.
                      setRestEndsAt(Date.now() + (warmup ? Math.min(60, it.restSec) : it.restSec) * 1000)
                      const working = (setsByItem.get(k) ?? []).filter((x) => !x.warmup).length + (warmup ? 0 : 1)
                      if (!warmup && working === it.sets) autoFollow()
                    }}
                    onUndo={(id) => db.sets.delete(id)}
                  />
                )}
              </div>
              )
            )
          })}
        </div>
      ))}

      <button className="btn primary big" onClick={finish}>Finish workout</button>
      <button className="btn danger ghost" onClick={() => discard()}>Discard workout</button>

      {sheet && (
        <SwapSheet
          item={s.plan.blocks[sheet.b].items[sheet.i]}
          options={sheet.options}
          onClose={() => setSheet(null)}
          onSwap={async (replacement, never) => {
            const current = s.plan.blocks[sheet.b].items[sheet.i]
            setSheet(null)
            await replaceItem(sheet.b, sheet.i, replacement)
            if (never) await excludeExercise(current.exerciseId)
          }}
          onSkip={async (never) => {
            const current = s.plan.blocks[sheet.b].items[sheet.i]
            setSheet(null)
            await replaceItem(sheet.b, sheet.i, { ...current, skipped: true })
            if (never) await excludeExercise(current.exerciseId)
            autoFollow()
          }}
        />
      )}

      {restLeft != null && (
        <div className={`timer-bar ${restLeft <= 0 ? 'over' : ''}`}>
          <div className="row between" style={{ maxWidth: 528, margin: '0 auto' }}>
            <div>
              <div className="muted small">{restLeft > 0 ? 'Rest' : 'Go! Rest over by'}</div>
              <div className="time">{fmt(restLeft)}</div>
            </div>
            <div className="row">
              <button className="btn" onClick={() => setRestEndsAt(Math.max(restEndsAt ?? 0, Date.now()) + 30_000)}>+30s</button>
              <button className="btn primary" onClick={() => setRestEndsAt(null)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function RepsItem({ item, logged, expanded, loads, bandLevels, equipment, onLog, onUndo }: {
  item: PlanItem
  logged: SetLog[]
  expanded: boolean
  loads: number[]
  bandLevels: string[]
  equipment: Equipment[]
  onLog: (weight: number | undefined, reps: number, rpe: number, assist: string | undefined, warmup: boolean) => void
  onUndo: (id: number) => void
}) {
  const ex = EXERCISE_BY_ID.get(item.exerciseId)
  const weighted = !!ex && isWeighted(ex.loading)
  const last = logged[logged.length - 1]
  // First time with no target: start light (empty bar / light dumbbells) and work up.
  const firstGuess = ex?.loading === 'barbell' || ex?.loading === 'landmine' ? loads[0] : loads[Math.floor(loads.length * 0.2)]
  const startWeight = last?.weight ?? item.targetWeight ?? firstGuess
  const [weight, setWeight] = useState<number | undefined>(startWeight)
  const [reps, setReps] = useState<number>(last?.reps ?? item.reps ?? item.repsMax ?? 8)
  // Band help (pull-ups): starts at no band, then keeps whatever the last set used.
  const [assist, setAssist] = useState<string | undefined>(last?.assist)
  const assistOptions = bandLevels.length ? bandLevels : ['band']
  // Warm-up sets are logged but don't count toward the plan or progression.
  const [warmup, setWarmup] = useState<boolean>(!!last?.warmup)
  const [extra, setExtra] = useState(false)
  const prevLastId = useRef(last?.id)
  useEffect(() => {
    // Carry the last logged values forward to the next set.
    if (last && last.id !== prevLastId.current) {
      prevLastId.current = last.id
      setWeight(last.weight)
      setReps(last.reps ?? reps)
      setAssist(last.assist)
      setWarmup(!!last.warmup)
      setExtra(false)
    }
  }, [last, reps])

  const workingDone = logged.filter((st) => !st.warmup).length
  const remaining = item.sets - workingDone
  const showPanel = expanded && (remaining > 0 || extra)
  const step = (dir: 1 | -1) => {
    if (loads.length) {
      const cur = weight ?? loads[0]
      setWeight((dir > 0 ? nextUp(cur, loads) : nextDown(cur, loads)) ?? cur)
    } else {
      setWeight(Math.max(0, (weight ?? 0) + dir * 5))
    }
  }
  const plates = weight != null && (ex?.loading === 'barbell' || ex?.loading === 'landmine') ? describePlates(weight, ex.loading, equipment) : ''
  let workingNo = 0

  return (
    <div className="stack">
      {logged.map((st) => (
        <div key={st.id} className={`set-row ${st.warmup ? '' : 'logged'}`}>
          <span className={`check ${st.warmup ? '' : 'on'}`}>{st.warmup ? '' : '✓'}</span>
          <span className="grow">
            {st.warmup ? <span className="muted">Warm-up: </span> : `Set ${++workingNo}: `}
            {st.weight != null ? `${st.weight} lb × ` : ''}{st.reps} reps
            {st.assist && <span className="pill" style={{ marginLeft: 6 }}>{st.assist === 'band' ? 'band' : `${st.assist} band`}</span>}
            {st.rpe != null && !st.warmup && <span className="muted"> · {EFFORT_OPTIONS.find((e) => e.rpe === st.rpe)?.label}</span>}
          </span>
          {expanded && <button className="btn ghost sm" onClick={() => onUndo(st.id!)}>Undo</button>}
        </div>
      ))}
      {showPanel && (
        <div className="stack">
          <p className="small">
            <b>{warmup ? 'Warm-up set' : remaining > 0 ? `Set ${workingDone + 1} of ${item.sets}` : `Extra set ${workingDone + 1}`}</b>
            {item.targetWeight != null && !warmup && <span className="muted"> · target {item.targetWeight} lb</span>}
          </p>
          {weighted && (
            <div className="chips">
              <button className={warmup ? '' : 'on'} onClick={() => { setWarmup(false); if (item.targetWeight != null) setWeight(item.targetWeight) }}>Working set</button>
              <button className={warmup ? 'on' : ''} onClick={() => setWarmup(true)}>Warm-up set</button>
            </div>
          )}
          {weighted && <Stepper value={weight} unit="lb" onDown={() => step(-1)} onUp={() => step(1)} />}
          {plates && <p className="muted small center" style={{ marginTop: -6 }}>{plates}</p>}
          <Stepper value={reps} unit="reps" onDown={() => setReps(Math.max(0, reps - 1))} onUp={() => setReps(reps + 1)} />
          {ex?.assistable && (
            <div className="stack" style={{ gap: 6 }}>
              <p className="muted small">Band for help?</p>
              <div className="chips">
                {[undefined, ...assistOptions].map((a) => (
                  <button key={a ?? 'none'} className={assist === a ? 'on' : ''} onClick={() => setAssist(a)}>
                    {a == null ? 'No band' : a === 'band' ? 'Band' : a}
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="muted small center">How did it feel? Tap to log the set.</p>
          <div className="effort">
            {EFFORT_OPTIONS.map((e) => (
              <button key={e.label} onClick={() => onLog(weighted ? weight : undefined, reps, e.rpe, ex?.assistable ? assist : undefined, weighted && warmup)}>
                {e.label}
                <small>{e.hint}</small>
              </button>
            ))}
          </div>
        </div>
      )}
      {expanded && remaining <= 0 && !extra && (
        <button className="btn ghost sm" onClick={() => setExtra(true)}>+ Add another set</button>
      )}
    </div>
  )
}

// One run of a timed exercise: get-ready, then work / rest for every set not yet done.
type Phase = { kind: 'ready' | 'work' | 'rest'; n: number; secs: number }

const sideOf = (item: PlanItem, n: number) => (item.alternating ? (n % 2 === 0 ? 'Right' : 'Left') : '')
const READY_SECS = 5

function buildPhases(item: PlanItem, todo: number[]): Phase[] {
  const work = (item.seconds ?? 30) * (item.perSide ? 2 : 1)
  const phases: Phase[] = [{ kind: 'ready', n: todo[0], secs: READY_SECS }]
  todo.forEach((n, j) => {
    phases.push({ kind: 'work', n, secs: work })
    if (j < todo.length - 1 && item.restSec > 0) phases.push({ kind: 'rest', n: todo[j + 1], secs: item.restSec })
  })
  return phases
}

function TimeItem({ item, checked, onToggle, onAllDone, expanded }: {
  item: PlanItem
  checked: (n: number) => boolean
  onToggle: (n: number) => void
  onAllDone: () => void
  expanded: boolean
}) {
  // The whole sequence runs from one tap: beep = go, double beep = rest, triple beep = finished.
  const [run, setRun] = useState<{ startedAt: number; phases: Phase[] } | null>(null)
  const now = useNow(run != null)
  const lastPhase = useRef(-1)
  const switched = useRef(false)

  // Where are we in the sequence? Worked out from the clock, so it stays accurate.
  let idx = -1
  let left = 0
  if (run) {
    let t = (now - run.startedAt) / 1000
    for (let i = 0; i < run.phases.length; i++) {
      if (t < run.phases[i].secs) { idx = i; left = run.phases[i].secs - t; break }
      t -= run.phases[i].secs
    }
    if (idx === -1) idx = run.phases.length // finished
  }
  const phase = run && idx < run.phases.length ? run.phases[idx] : null

  useEffect(() => {
    if (!run || idx === lastPhase.current) return
    // Tick off every work phase we've moved past (also covers a phone that slept through one).
    for (let i = 0; i < Math.min(idx, run.phases.length); i++) {
      const ph = run.phases[i]
      if (ph.kind === 'work' && !checked(ph.n)) onToggle(ph.n)
    }
    lastPhase.current = idx
    switched.current = false
    if (idx >= run.phases.length) {
      alertUser(3)
      setRun(null)
      onAllDone()
    } else if (run.phases[idx].kind === 'work') alertUser(1)
    else if (run.phases[idx].kind === 'rest') alertUser(2)
  }, [idx, run, checked, onToggle, onAllDone])

  // Hold-for-time moves done on both sides in one set: beep halfway to switch.
  useEffect(() => {
    if (phase?.kind === 'work' && item.perSide && !switched.current && left <= phase.secs / 2) {
      switched.current = true
      alertUser(1)
    }
  }, [phase, left, item.perSide])

  const todo = Array.from({ length: item.sets }, (_, j) => j).filter((j) => !checked(j))
  const totalSecs = todo.length ? buildPhases(item, todo).reduce((t, p) => t + (p.kind === 'ready' ? 0 : p.secs), 0) : 0
  const dotLabel = (n: number) => (item.alternating ? `${sideOf(item, n)[0]}${Math.floor(n / 2) + 1}` : item.sets > 1 ? String(n + 1) : 'Done')

  return (
    <div className="stack">
      <div className="set-dots">
        {Array.from({ length: item.sets }, (_, n) => (
          <button key={n} className={checked(n) ? 'on' : ''} onClick={() => onToggle(n)} aria-label={`set ${n + 1} done`}>
            {checked(n) ? '✓' : dotLabel(n)}
          </button>
        ))}
      </div>
      {expanded && todo.length > 0 && !run && (
        <button
          className="btn primary"
          onClick={() => {
            unlockAudio()
            lastPhase.current = -1
            setRun({ startedAt: Date.now(), phases: buildPhases(item, todo) })
          }}
        >
          ▶ Start {todo.length > 1 ? `all ${todo.length} sets` : ''} · {fmt(totalSecs)}
          {todo.length > 1 && item.restSec > 0 ? ` (incl. ${item.restSec}s rests)` : ''}
        </button>
      )}
      {phase && (
        <div className={`interval ${phase.kind}`}>
          <div className="row between">
            <div>
              <div className="interval-label">
                {phase.kind === 'ready' ? 'Get ready' : phase.kind === 'rest' ? 'Rest' : item.alternating ? `${sideOf(item, phase.n)} side` : 'Go'}
              </div>
              <div className="muted small">
                {phase.kind === 'work'
                  ? `Set ${phase.n + 1} of ${item.sets}${item.perSide ? (switched.current ? ' · second side' : ' · beep halfway = switch sides') : ''}`
                  : `Next: ${item.alternating ? `${sideOf(item, phase.n)} side · ` : ''}set ${phase.n + 1} of ${item.sets}`}
              </div>
            </div>
            <span className="interval-time">{fmt(left)}</span>
          </div>
          <button className="btn sm" onClick={() => setRun(null)}>Stop</button>
        </div>
      )}
    </div>
  )
}
