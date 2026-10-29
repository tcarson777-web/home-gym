import Dexie, { type EntityTable } from 'dexie'
import type { Equipment, Profile, Session, SetLog } from './types'

export interface Setting {
  key: string
  value: unknown
}

// The on-device database. Data never leaves the phone unless you export a backup.
export const db = new Dexie('home-gym') as Dexie & {
  equipment: EntityTable<Equipment, 'id'>
  profile: EntityTable<Profile, 'id'>
  sessions: EntityTable<Session, 'id'>
  sets: EntityTable<SetLog, 'id'>
  settings: EntityTable<Setting, 'key'>
}

db.version(1).stores({
  equipment: '++id, kind',
  profile: 'id',
  sessions: '++id, date, status, type',
  sets: '++id, sessionId, exerciseId, loggedAt',
  settings: 'key',
})

export const DEFAULT_PROFILE: Profile = {
  id: 'me',
  experience: 'new',
  injuries: '',
  goals: 'Build strength',
  sessionMinutes: 45,
  warmupMinutes: 10,
  sessionsPerWeek: 3,
}

export async function getProfile(): Promise<Profile> {
  return (await db.profile.get('me')) ?? DEFAULT_PROFILE
}

const TABLES = ['equipment', 'profile', 'sessions', 'sets', 'settings'] as const

// Backups deliberately leave out the API key.
const PRIVATE_SETTINGS = new Set(['apiKey'])

export async function exportBackup(): Promise<string> {
  const data: Record<string, unknown[]> = {}
  for (const t of TABLES) data[t] = await db.table(t).toArray()
  data.settings = (data.settings as Setting[]).filter((s) => !PRIVATE_SETTINGS.has(s.key))
  return JSON.stringify({ app: 'home-gym', version: 1, exportedAt: new Date().toISOString(), data }, null, 2)
}

export async function importBackup(json: string): Promise<void> {
  const parsed = JSON.parse(json)
  if (parsed?.app !== 'home-gym' || !parsed.data) throw new Error('This file is not a Home Gym backup.')
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      const rows = parsed.data[t]
      if (!Array.isArray(rows)) continue
      if (t === 'settings') {
        // Keep the API key already on this device.
        await db.settings.where('key').noneOf([...PRIVATE_SETTINGS]).delete()
      } else {
        await db.table(t).clear()
      }
      await db.table(t).bulkPut(rows)
    }
  })
}
