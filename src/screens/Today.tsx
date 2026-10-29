import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, DEFAULT_PROFILE } from '../lib/db'
import { startSession, weekStatus } from '../lib/schedule'
import type { Session, SessionType } from '../lib/types'

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
  const other: SessionType = week.suggested === 'strength' ? 'mobility' : 'strength'
  const overTarget = week.done.length >= target
  const isBonus = week.complete // the 4th (or later) session once the week's 3 incl. mobility are done

  async function start(type: SessionType) {
    setBusy(true)
    try {
      onOpenWorkout(await startSession(type, isBonus))
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
      ) : overTarget ? (
        <div className="card stack">
          <h2>{week.complete ? 'Week complete ✅' : `${target} sessions done`}</h2>
          <p className="muted">
            {week.complete
              ? 'Nice work. Rest up — or, if you are feeling good, add a bonus session.'
              : "You haven't done a mobility session yet this week."}
          </p>
          {!week.complete && (
            <button className="btn primary big" disabled={busy} onClick={() => start('mobility')}>
              Start {LABEL.mobility}
            </button>
          )}
          {week.complete && (
            <>
              <button className="btn primary big" disabled={busy} onClick={() => start('strength')}>
                💪 Add bonus strength session
              </button>
              <button className="btn" disabled={busy} onClick={() => start('mobility')}>
                Bonus mobility session instead
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="card stack">
          <span className="muted small">Next up</span>
          <h2>{LABEL[week.suggested]}</h2>
          <p className="muted small">~{(profile ?? DEFAULT_PROFILE).sessionMinutes} min, warm-up included.</p>
          <button className="btn primary big" disabled={busy} onClick={() => start(week.suggested)}>
            Start workout
          </button>
          <button className="btn ghost" disabled={busy} onClick={() => start(other)}>
            Do {LABEL[other]} instead
          </button>
        </div>
      )}
    </div>
  )
}
