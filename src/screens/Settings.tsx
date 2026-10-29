import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db, DEFAULT_PROFILE, exportBackup, importBackup } from '../lib/db'
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

  async function backup() {
    const json = await exportBackup()
    const name = `home-gym-backup-${new Date().toISOString().slice(0, 10)}.json`
    const file = new File([json], name, { type: 'application/json' })
    // On Android this opens the share sheet (e.g. save to Google Drive); otherwise it downloads.
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Home Gym backup' })
        return
      } catch {
        // cancelled; fall through to download
      }
    }
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
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
            Session length (min)
            <input className="input" type="number" inputMode="numeric" value={p.sessionMinutes} onChange={(e) => set({ sessionMinutes: parseInt(e.target.value) || 45 })} />
          </label>
          <label className="field grow">
            Sessions / week
            <input className="input" type="number" inputMode="numeric" value={p.sessionsPerWeek} onChange={(e) => set({ sessionsPerWeek: Math.max(1, parseInt(e.target.value) || 3) })} />
          </label>
        </div>
        <button className="btn primary" onClick={save}>{saved ? 'Saved ✓' : 'Save'}</button>
      </div>

      <div className="card stack">
        <h2>Backup</h2>
        <p className="muted small">
          Your data lives only on this phone. Clearing Chrome's site data or uninstalling the app erases it, so save a backup every few weeks (e.g. to Google Drive).
        </p>
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
