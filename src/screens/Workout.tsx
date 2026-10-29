import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState } from 'react'
import Stepper from '../components/Stepper'
import { alertUser, keepScreenOn, unlockAudio } from '../lib/alerts'
import { db } from '../lib/db'
import { isWeighted, loadsFor, nextDown, nextUp } from '../lib/equipment'
import { EXERCISE_BY_ID } from '../lib/exercises'
import { fmtTime as fmt, repsLabel } from '../lib/format'
import { EFFORT_OPTIONS, type PlanItem, type Session, type SetLog } from '../lib/types'

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
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null)
  const now = useNow(true)

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
    it.kind === 'reps'
      ? (setsByItem.get(key(b, i))?.length ?? 0) >= it.sets
      : Array.from({ length: it.sets }, (_, n) => s.checked.includes(`${key(b, i)}:${n}`)).every(Boolean)

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

  const elapsed = (now - new Date(s.date).getTime()) / 1000
  const restLeft = restEndsAt ? (restEndsAt - now) / 1000 : null

  return (
    <div className="stack" style={{ paddingBottom: restEndsAt ? 120 : 24 }}>
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
              <div key={k} className={`card stack ${isActive ? 'active' : ''} ${done && !isActive ? 'done' : ''}`}>
                <button className="row between" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => setActiveKey(isActive ? null : k)}>
                  <div className="grow">
                    <h3>{done ? '✓ ' : ''}{it.name}</h3>
                    <p className="muted small">{repsLabel(it)}</p>
                  </div>
                  {it.restSec > 0 && <span className="pill">rest {fmt(it.restSec)}</span>}
                </button>
                {isActive && it.cue && <p className="small muted">{it.cue}</p>}
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
                    onLog={async (weight, reps, rpe) => {
                      unlockAudio()
                      const n = setsByItem.get(k)?.length ?? 0
                      await db.sets.add({ sessionId, exerciseId: it.exerciseId, exerciseName: it.name, blockIdx: b, itemIdx: i, setIdx: n, weight, reps, rpe, loggedAt: new Date().toISOString() })
                      setRestEndsAt(Date.now() + it.restSec * 1000)
                      if (n + 1 >= it.sets) autoFollow()
                    }}
                    onUndo={(id) => db.sets.delete(id)}
                  />
                )}
              </div>
            )
          })}
        </div>
      ))}

      <button className="btn primary big" onClick={finish}>Finish workout</button>
      <button className="btn danger ghost" onClick={() => discard()}>Discard workout</button>

      {restLeft != null && (
        <div className={`timer-bar ${restLeft <= 0 ? 'over' : ''}`}>
          <div className="row between" style={{ maxWidth: 528, margin: '0 auto' }}>
            <div>
              <div className="muted small">{restLeft > 0 ? 'Rest' : 'Go! Rest over by'}</div>
              <div className="time">{fmt(restLeft)}</div>
            </div>
            <div className="row">
              <button className="btn" onClick={() => setRestEndsAt((t) => (t ?? Date.now()) + 30_000)}>+30s</button>
              <button className="btn primary" onClick={() => setRestEndsAt(null)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function RepsItem({ item, logged, expanded, loads, onLog, onUndo }: {
  item: PlanItem
  logged: SetLog[]
  expanded: boolean
  loads: number[]
  onLog: (weight: number | undefined, reps: number, rpe: number) => void
  onUndo: (id: number) => void
}) {
  const ex = EXERCISE_BY_ID.get(item.exerciseId)
  const weighted = !!ex && isWeighted(ex.loading)
  const last = logged[logged.length - 1]
  // First time with no target: start light (empty bar / light dumbbells) and work up.
  const firstGuess = ex?.loading === 'barbell' || ex?.loading === 'landmine' ? loads[0] : loads[Math.floor(loads.length * 0.2)]
  const startWeight = last?.weight ?? item.targetWeight ?? firstGuess
  const [weight, setWeight] = useState<number | undefined>(startWeight)
  const [reps, setReps] = useState<number>(last?.reps ?? item.repsMax ?? item.reps ?? 8)
  const prevLastId = useRef(last?.id)
  useEffect(() => {
    // Carry the last logged values forward to the next set.
    if (last && last.id !== prevLastId.current) {
      prevLastId.current = last.id
      setWeight(last.weight)
      setReps(last.reps ?? reps)
    }
  }, [last, reps])

  const remaining = item.sets - logged.length
  const step = (dir: 1 | -1) => {
    if (loads.length) {
      const cur = weight ?? loads[0]
      setWeight((dir > 0 ? nextUp(cur, loads) : nextDown(cur, loads)) ?? cur)
    } else {
      setWeight(Math.max(0, (weight ?? 0) + dir * 5))
    }
  }

  return (
    <div className="stack">
      {logged.map((st) => (
        <div key={st.id} className="set-row logged">
          <span className="check on">✓</span>
          <span className="grow">
            Set {st.setIdx + 1}: {st.weight != null ? `${st.weight} lb × ` : ''}{st.reps} reps
            {st.rpe != null && <span className="muted"> · {EFFORT_OPTIONS.find((e) => e.rpe === st.rpe)?.label}</span>}
          </span>
          {expanded && <button className="btn ghost sm" onClick={() => onUndo(st.id!)}>Undo</button>}
        </div>
      ))}
      {expanded && remaining > 0 && (
        <div className="stack">
          <p className="small"><b>Set {logged.length + 1} of {item.sets}</b></p>
          {weighted && <Stepper value={weight} unit="lb" onDown={() => step(-1)} onUp={() => step(1)} />}
          <Stepper value={reps} unit="reps" onDown={() => setReps(Math.max(0, reps - 1))} onUp={() => setReps(reps + 1)} />
          <p className="muted small center">How did it feel? Tap to log the set.</p>
          <div className="effort">
            {EFFORT_OPTIONS.map((e) => (
              <button key={e.label} onClick={() => onLog(weighted ? weight : undefined, reps, e.rpe)}>
                {e.label}
                <small>{e.hint}</small>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function TimeItem({ item, checked, onToggle, onAllDone, expanded }: {
  item: PlanItem
  checked: (n: number) => boolean
  onToggle: (n: number) => void
  onAllDone: () => void
  expanded: boolean
}) {
  const [timer, setTimer] = useState<{ n: number; endsAt: number; total: number } | null>(null)
  const now = useNow(timer != null)
  const switched = useRef(false)

  useEffect(() => {
    if (!timer) return
    const left = (timer.endsAt - now) / 1000
    if (item.perSide && !switched.current && left <= timer.total / 2) {
      switched.current = true
      alertUser(1)
    }
    if (left <= 0) {
      alertUser(2)
      const n = timer.n
      setTimer(null)
      if (!checked(n)) onToggle(n)
      if (Array.from({ length: item.sets }, (_, j) => j === n || checked(j)).every(Boolean)) onAllDone()
    }
  }, [now, timer, item, checked, onToggle, onAllDone])

  const total = (item.seconds ?? 30) * (item.perSide ? 2 : 1)
  const nextN = Array.from({ length: item.sets }, (_, j) => j).find((j) => !checked(j))

  return (
    <div className="stack">
      <div className="set-dots">
        {Array.from({ length: item.sets }, (_, n) => (
          <button key={n} className={checked(n) ? 'on' : ''} onClick={() => onToggle(n)} aria-label={`set ${n + 1} done`}>
            {checked(n) ? '✓' : item.sets > 1 ? n + 1 : 'Done'}
          </button>
        ))}
        {expanded && nextN != null && !timer && (
          <button
            onClick={() => {
              unlockAudio()
              switched.current = false
              setTimer({ n: nextN, endsAt: Date.now() + total * 1000, total })
            }}
          >
            ▶ {fmt(total)}
          </button>
        )}
      </div>
      {timer && (
        <div className="row between">
          <span style={{ fontSize: '2rem', fontWeight: 800 }}>{fmt((timer.endsAt - now) / 1000)}</span>
          <span className="muted small">{item.perSide ? (switched.current ? 'Second side' : 'First side — beep = switch') : ''}</span>
          <button className="btn sm" onClick={() => setTimer(null)}>Stop</button>
        </div>
      )}
    </div>
  )
}
