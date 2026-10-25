// amoCRM: yangi xabar/bildirishnomada qisqa ovoz; imBox «…» → «Отключить звук» (holat brauzerda saqlanadi)
const KEY = 'amo_sound_off'

export const isMuted = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }
export function setMuted(v) { try { localStorage.setItem(KEY, v ? '1' : '0') } catch { /* */ } }

let ctx = null
export function playPing() {
  if (isMuted()) return
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)()
    const now = ctx.currentTime
    ;[[880, 0], [1320, 0.12]].forEach(([f, d]) => {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.type = 'sine'; o.frequency.value = f
      g.gain.setValueAtTime(0.0001, now + d)
      g.gain.exponentialRampToValueAtTime(0.18, now + d + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, now + d + 0.25)
      o.connect(g).connect(ctx.destination)
      o.start(now + d); o.stop(now + d + 0.3)
    })
  } catch { /* brauzer ovozga ruxsat bermasa — jim */ }
}
