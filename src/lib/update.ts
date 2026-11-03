// App updates: never reload by surprise (e.g. mid-workout). When a new version is
// downloaded we just flag it; the user taps to apply it, or it applies on next launch.
import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'

let ready = false
const listeners = new Set<() => void>()

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    ready = true
    listeners.forEach((l) => l())
  },
})

export function useUpdateReady(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => ready,
  )
}

export function applyUpdate() {
  void updateSW(true)
}
