// Shared data shapes. Everything is stored on the device (IndexedDB).
// All weights are in pounds.

export type EquipmentKind =
  | 'adjustable_dumbbells'
  | 'fixed_dumbbells'
  | 'barbell'
  | 'plates'
  | 'kettlebells'
  | 'bench'
  | 'rack'
  | 'pullup_bar'
  | 'bands'
  | 'mat'
  | 'box'
  | 'rings'
  | 'jump_rope'
  | 'cardio_machine'
  | 'other'

export interface PlatePair {
  weight: number // weight of ONE plate, lb
  pairs: number // how many matching pairs you own
}

export interface Equipment {
  id?: number
  kind: EquipmentKind
  name: string
  // Adjustable dumbbells
  minWeight?: number
  maxWeight?: number
  increment?: number
  // Fixed dumbbells / kettlebells: each weight you own (dumbbells assumed in pairs)
  weights?: number[]
  // Barbell
  barWeight?: number
  // Plates
  plates?: PlatePair[]
  // Bench
  incline?: boolean
  // Bands: free-text labels e.g. "light", "medium", "heavy"
  bandLevels?: string[]
  notes?: string
}

export type Experience = 'new' | 'under1' | '1to3' | 'over3'

export interface Profile {
  id: 'me'
  experience: Experience
  bodyweight?: number
  injuries: string
  goals: string
  sessionMinutes: number
  warmupMinutes: number
  sessionsPerWeek: number
}

export type SessionType = 'strength' | 'mobility'

export type ItemKind = 'reps' | 'time'

export interface PlanItem {
  exerciseId: string // key into the exercise library
  name: string
  kind: ItemKind
  sets: number
  reps?: number // target reps per set (kind = 'reps')
  repsMax?: number // upper end of a rep range, if any
  seconds?: number // per set (kind = 'time')
  perSide?: boolean // time or reps are per side / per arm / per leg
  targetWeight?: number // lb; undefined = bodyweight or "pick a weight"
  restSec: number
  cue?: string
  isMainLift?: boolean
}

export interface PlanBlock {
  name: string // "Warm-up", "Main lifts", "Accessories", "Cool-down"...
  items: PlanItem[]
}

export interface Plan {
  title: string
  type: SessionType
  estimatedMinutes: number
  blocks: PlanBlock[]
  coachNote?: string
  source: 'rules' | 'ai'
  variant?: 'A' | 'B' // strength day rotation
}

export type SessionStatus = 'in_progress' | 'done'

export interface Session {
  id?: number
  date: string // ISO timestamp when started
  finishedAt?: string
  type: SessionType
  status: SessionStatus
  plan: Plan
  bonus: boolean
  notes?: string
  // Items in time-based / checklist blocks that were ticked off: "blockIdx:itemIdx"
  checked: string[]
}

// Effort scale shown as 4 big buttons, stored as RPE (rate of perceived exertion, 1-10)
export const EFFORT_OPTIONS = [
  { label: 'Easy', rpe: 6, hint: '4+ reps left' },
  { label: 'Good', rpe: 7.5, hint: '2–3 left' },
  { label: 'Hard', rpe: 9, hint: '1 left' },
  { label: 'Max', rpe: 10, hint: '0 left' },
] as const

export interface SetLog {
  id?: number
  sessionId: number
  exerciseId: string
  exerciseName: string
  blockIdx: number
  itemIdx: number
  setIdx: number
  weight?: number
  reps?: number
  seconds?: number
  rpe?: number
  loggedAt: string
}

// Placeholder for the later Fitbit / Google Health integration.
// Nothing fills this yet; the plan generator already accepts it.
export interface RecoverySignals {
  source: 'fitbit' | 'manual'
  date: string
  sleepHours?: number
  restingHeartRate?: number
  hrvMs?: number
  steps?: number
}
