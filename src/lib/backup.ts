// Saving backup files, and the reminder to do it. Data only lives on this phone,
// so a backup file (e.g. in Google Drive) is what survives a new or reset phone.

import { db, exportBackup } from './db'
import type { Session } from './types'

const DAY_MS = 86_400_000
export const REMIND_AFTER_DAYS = 14
const SNOOZE_DAYS = 3

/**
 * Save a backup file: the share sheet on Android (pick Google Drive), a download elsewhere.
 * Returns true if it was saved (or handed to the share sheet), false if you cancelled.
 */
export async function saveBackupFile(): Promise<boolean> {
  const json = await exportBackup()
  const name = `home-gym-backup-${new Date().toISOString().slice(0, 10)}.json`
  const file = new File([json], name, { type: 'application/json' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Home Gym backup' })
    } catch (e) {
      if ((e as Error).name === 'AbortError') return false // you closed the share sheet
      downloadFile(file)
    }
  } else {
    downloadFile(file)
  }
  await db.settings.put({ key: 'lastBackupAt', value: new Date().toISOString() })
  return true
}

function downloadFile(file: File) {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  URL.revokeObjectURL(url)
}

export async function snoozeBackupReminder() {
  await db.settings.put({ key: 'backupSnoozeUntil', value: new Date(Date.now() + SNOOZE_DAYS * DAY_MS).toISOString() })
}

export interface BackupStatus {
  lastBackupAt?: string
  workoutsSince: number
  remind: boolean
}

/** Remind when there's unsaved workout history and the last backup is old (or never happened). */
export function backupStatus(sessions: Session[], lastBackupAt: string | undefined, snoozeUntil: string | undefined, now = Date.now()): BackupStatus {
  const workoutsSince = sessions.filter((s) => s.status === 'done' && (!lastBackupAt || (s.finishedAt ?? s.date) > lastBackupAt)).length
  const stale = !lastBackupAt || now - new Date(lastBackupAt).getTime() > REMIND_AFTER_DAYS * DAY_MS
  const snoozed = !!snoozeUntil && new Date(snoozeUntil).getTime() > now
  return { lastBackupAt, workoutsSince, remind: workoutsSince > 0 && stale && !snoozed }
}

export function daysAgo(iso: string, now = Date.now()): string {
  const d = Math.floor((now - new Date(iso).getTime()) / DAY_MS)
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`
}
