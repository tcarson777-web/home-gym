import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../lib/db'
import { EFFORT_OPTIONS, type SetLog } from '../lib/types'

// v0.1: a simple list. Trend charts come in v0.3.
export default function HistoryScreen() {
  const sessions = useLiveQuery(() => db.sessions.where('status').equals('done').reverse().sortBy('date'), [], [])
  const sets = useLiveQuery(() => db.sets.toArray(), [], [])
  const [open, setOpen] = useState<number | null>(null)

  const bySession = new Map<number, SetLog[]>()
  for (const s of sets) {
    if (!bySession.has(s.sessionId)) bySession.set(s.sessionId, [])
    bySession.get(s.sessionId)!.push(s)
  }

  return (
    <div className="stack">
      <div>
        <h1>History</h1>
        <p className="muted small">{sessions.length} workouts logged. Progress charts are coming next.</p>
      </div>
      {sessions.length === 0 && <div className="card muted">Finish your first workout and it will show up here.</div>}
      {sessions.map((s) => {
        const logs = (bySession.get(s.id!) ?? []).sort((a, b) => a.loggedAt.localeCompare(b.loggedAt))
        const mins = s.finishedAt ? Math.round((new Date(s.finishedAt).getTime() - new Date(s.date).getTime()) / 60000) : null
        // Best set per exercise (heaviest, then most reps)
        const best = new Map<string, SetLog>()
        for (const l of logs) {
          const b = best.get(l.exerciseName)
          if (!b || (l.weight ?? 0) > (b.weight ?? 0) || ((l.weight ?? 0) === (b.weight ?? 0) && (l.reps ?? 0) > (b.reps ?? 0))) best.set(l.exerciseName, l)
        }
        return (
          <div key={s.id} className="card stack">
            <button className="row between" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => setOpen(open === s.id ? null : s.id!)}>
              <div className="grow">
                <p className="muted small">
                  {new Date(s.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  {mins != null && ` · ${mins} min`}
                  {s.bonus && ' · bonus'}
                </p>
                <h3>{s.plan.title}</h3>
              </div>
              <span className={`pill ${s.type === 'mobility' ? 'mobility' : ''}`}>{s.type}</span>
            </button>
            {[...best.values()].map((b) => (
              <p key={b.exerciseName} className="small">
                {b.exerciseName}: <b>{b.weight != null ? `${b.weight} lb × ` : ''}{b.reps}</b>
              </p>
            ))}
            {open === s.id && (
              <div className="stack">
                {logs.map((l) => (
                  <p key={l.id} className="small muted">
                    {l.exerciseName} · set {l.setIdx + 1}: {l.weight != null ? `${l.weight} lb × ` : ''}{l.reps}
                    {l.rpe != null && ` · ${EFFORT_OPTIONS.find((e) => e.rpe === l.rpe)?.label}`}
                  </p>
                ))}
                <button
                  className="btn danger sm"
                  onClick={async () => {
                    if (!confirm('Delete this workout from history?')) return
                    await db.sets.where('sessionId').equals(s.id!).delete()
                    await db.sessions.delete(s.id!)
                  }}
                >
                  Delete workout
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
