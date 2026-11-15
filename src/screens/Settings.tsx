import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { daysAgo, saveBackupFile } from '../lib/backup'
import { db, DEFAULT_PROFILE, importBackup } from '../lib/db'
import { EXERCISE_BY_ID } from '../lib/exercises'
import type { Experience, Profile } from '../lib/types'

const EXPERIENCE: { value: Experience; label: string }[] = [
  { value: 'new', label: 'New to lifting' },
  { value: 'under1', label: 'Less than 1 year' },
  { value: '1to3', label: '1–3 years' },
  { value: 'over3', label: 'More than 3 years' },
]

export default function SettingsScreen() {
  const stored = useLiveQuery(() => db.profile.get('me'))
  const [p, setP] = useState<Profile>(DEFAULT_PROFILE)
  const [saved, setSaved] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (stored) setP(stored)
  }, [stored])

  const set = (patch: Partial<Profile>) => {
    setP((prev) => ({ ...prev, ...patch }))
    setSaved(false)
  }

  async function save() {
    await db.profile.put(p)
    setSaved(true)
  }

  const lastBackupAt = useLiveQuery(() => db.settings.get('lastBackupAt'))?.value as string | undefined

  async function backup() {
    if (await saveBackupFile()) setMsg('Backup saved ✓')
  }

  async function restore(f: File | undefined) {
    if (!f) return
    if (!confirm('Restoring replaces everything currently in the app with the backup. Continue?')) return
    try {
      await importBackup(await f.text())
      setMsg('Backup restored ✓')
    } catch (e) {
      setMsg(`Could not restore: ${(e as Error).message}`)
    }
  }

  return (
    <div className="stack">
      <h1>Settings</h1>

      <div className="card stack">
        <h2>About you</h2>
        <label className="field">
          Lifting experience
          <select className="input" value={p.experience} onChange={(e) => set({ experience: e.target.value as Experience })}>
            {EXPERIENCE.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
          </select>
        </label>
        <label className="field">
          Bodyweight (lb, optional)
          <input className="input" type="number" inputMode="decimal" value={p.bodyweight ?? ''} onChange={(e) => set({ bodyweight: e.target.value ? parseFloat(e.target.value) : undefined })} />
        </label>
        <label className="field">
          Goals
          <textarea className="input" value={p.goals} onChange={(e) => set({ goals: e.target.value })} />
        </label>
        <label className="field">
          Injuries or movements to avoid
          <textarea className="input" placeholder="e.g. left shoulder gets cranky overhead" value={p.injuries} onChange={(e) => set({ injuries: e.target.value })} />
        </label>
        <p className="muted small">The AI coach (next version) will use these. The built-in planner can't read free text, so it won't avoid movements yet — swap them yourself for now.</p>
        <div className="row">
          <label className="field grow">
            Shortest session (min)
            <input className="input" type="number" inputMode="numeric" value={p.sessionMinutes} onChange={(e) => set({ sessionMinutes: parseInt(e.target.value) || 45 })} />
          </label>
          <label className="field grow">
            Longest session (min)
            <input className="input" type="number" inputMode="numeric" value={p.sessionMaxMinutes ?? p.sessionMinutes + 15} onChange={(e) => set({ sessionMaxMinutes: parseInt(e.target.value) || 60 })} />
          </label>
        </div>
        <label className="field">
            Sessions / week
            <input className="input" type="number" inputMode="numeric" value={p.sessionsPerWeek} onChange={(e) => set({ sessionsPerWeek: Math.max(1, parseInt(e.target.value) || 3) })} />
          </label>
        <button className="btn primary" onClick={save}>{saved ? 'Saved ✓' : 'Save'}</button>
      </div>

      <div className="card stack">
        <h2>Removed exercises</h2>
        {stored === undefined ? null : (stored?.excludedExercises ?? []).length === 0 ? (
          <p className="muted small">None. To stop an exercise being suggested, tap it in the workout preview on the Today screen.</p>
        ) : (
          (stored?.excludedExercises ?? []).map((id) => (
            <div key={id} className="row between">
              <span>{EXERCISE_BY_ID.get(id)?.name ?? id}</span>
              <button
                className="btn sm"
                onClick={() => db.profile.update('me', { excludedExercises: (stored?.excludedExercises ?? []).filter((x) => x !== id) })}
              >
                Bring back
              </button>
            </div>
          ))
        )}
      </div>

      <div className="card stack">
        <h2>Backup</h2>
        <p className="muted small">
          Your data lives only on this phone. Clearing Chrome's site data or uninstalling the app erases it, so save a backup every few weeks (e.g. to Google Drive).
        </p>
        <p className="small">{lastBackupAt ? `Last backup: ${daysAgo(lastBackupAt)}` : 'No backup saved yet.'}</p>
        <button className="btn" onClick={backup}>Save backup file</button>
        <label className="btn center" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          Restore from backup…
          <input type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => restore(e.target.files?.[0])} />
        </label>
        {msg && <p className="small">{msg}</p>}
      </div>

      <p className="muted small center">Home Gym v0.1</p>
    </div>
  )
}
