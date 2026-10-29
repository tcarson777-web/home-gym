import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from './lib/db'
import EquipmentScreen from './screens/Equipment'
import HistoryScreen from './screens/History'
import SettingsScreen from './screens/Settings'
import TodayScreen from './screens/Today'
import WorkoutScreen from './screens/Workout'

type Tab = 'today' | 'equipment' | 'history' | 'settings'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'today', label: 'Today', icon: '🏠' },
  { id: 'equipment', label: 'Equipment', icon: '🏋️' },
  { id: 'history', label: 'History', icon: '📈' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('today')
  const [openWorkout, setOpenWorkout] = useState<number | null>(null)
  const active = useLiveQuery(() => db.sessions.where('status').equals('in_progress').first())

  if (openWorkout != null) {
    return (
      <div className="app">
        <WorkoutScreen sessionId={openWorkout} onClose={() => setOpenWorkout(null)} />
      </div>
    )
  }

  return (
    <>
      <div className="app">
        {tab === 'today' && <TodayScreen activeSession={active} onOpenWorkout={setOpenWorkout} goTo={setTab} />}
        {tab === 'equipment' && <EquipmentScreen />}
        {tab === 'history' && <HistoryScreen />}
        {tab === 'settings' && <SettingsScreen />}
      </div>
      <nav className="tabs">
        <div className="tabs-inner">
          {TABS.map((t) => (
            <button key={t.id} className={`tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
              <span className="icon">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </>
  )
}
