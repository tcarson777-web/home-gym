// Beep + vibrate for timers. Browsers only allow sound after a tap, so
// unlockAudio() is called from button handlers.

let ctx: AudioContext | null = null

export function unlockAudio() {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    // no audio available
  }
}

export function alertUser(times = 2) {
  navigator.vibrate?.(Array.from({ length: times * 2 - 1 }, (_, i) => (i % 2 ? 120 : 250)))
  if (!ctx) return
  for (let i = 0; i < times; i++) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 880
    gain.gain.value = 0.25
    osc.connect(gain).connect(ctx.destination)
    const t = ctx.currentTime + i * 0.35
    osc.start(t)
    osc.stop(t + 0.2)
  }
}

let wakeLock: WakeLockSentinel | null = null

export async function keepScreenOn(on: boolean) {
  try {
    if (on && !wakeLock && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock?.request('screen')
      wakeLock?.addEventListener('release', () => (wakeLock = null))
    } else if (!on && wakeLock) {
      await wakeLock.release()
      wakeLock = null
    }
  } catch {
    // not supported or denied; fine
  }
}
