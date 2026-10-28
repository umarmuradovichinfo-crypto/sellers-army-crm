import JsSIP from 'jssip'

// OnlinePBX brauzer-telefoni (WebRTC/JsSIP). SIP over WebSocket: wss://{domen}:7443,
// sip:{ext}@{domen}, operatorning SIP paroli. Kiruvchi/chiquvchi qo'ng'iroq + ovoz.
// Yagona (singleton) — butun CRM bo'ylab bitta registratsiya.
class WebRtcPhone {
  constructor() {
    this.ua = null
    this.session = null
    this.audio = null
    this.domain = ''
    this.state = 'offline' // offline | connecting | registered | failed
    this.listeners = {}
  }

  on(evt, cb) {
    ;(this.listeners[evt] || (this.listeners[evt] = [])).push(cb)
    return () => { this.listeners[evt] = (this.listeners[evt] || []).filter((f) => f !== cb) }
  }
  emit(evt, data) { (this.listeners[evt] || []).forEach((cb) => { try { cb(data) } catch { /* */ } }) }
  setState(s) { this.state = s; this.emit('state', s) }

  ensureAudio() {
    if (!this.audio) {
      const a = document.createElement('audio')
      a.autoplay = true; a.style.display = 'none'
      document.body.appendChild(a); this.audio = a
    }
    return this.audio
  }

  isOn() { return this.state === 'registered' }

  start({ wss, uri, password, displayName }) {
    if (!wss || !uri || !password) return
    if (this.ua) this.stop()
    this.domain = String(uri).split('@')[1] || ''
    try {
      JsSIP.debug.disable()
      const socket = new JsSIP.WebSocketInterface(wss)
      this.ua = new JsSIP.UA({
        sockets: [socket], uri, password,
        display_name: displayName || 'Operator',
        register: true, session_timers: false,
      })
      this.setState('connecting')
      this.ua.on('registered', () => this.setState('registered'))
      this.ua.on('unregistered', () => this.setState('offline'))
      this.ua.on('registrationFailed', (e) => { this.setState('failed'); this.emit('error', e && e.cause) })
      this.ua.on('disconnected', () => { if (this.state !== 'failed') this.setState('connecting') })
      this.ua.on('newRTCSession', (data) => this.handleSession(data))
      this.ua.start()
    } catch (e) { this.setState('failed'); this.emit('error', e && e.message) }
  }

  stop() {
    try { this.ua && this.ua.stop() } catch { /* */ }
    this.ua = null; this.session = null; this.setState('offline')
  }

  handleSession({ session }) {
    if (this.session) { try { session.terminate() } catch { /* */ } return } // bitta aktiv qo'ng'iroq
    this.session = session
    const dir = session.direction // 'incoming' | 'outgoing'
    const peer = (session.remote_identity && session.remote_identity.uri && session.remote_identity.uri.user) || ''

    session.on('peerconnection', (e) => this.attachRemote(e.peerconnection))
    // JsSIP INVITE/200 OK ni ICE yig'ish TUGAGACH yuboradi. STUN server javob bermasa (o'z stansiyamizda stun:<domen>:3478 yo'q) Chrome
    // ~40 s kutadi — jonli sinovda INVITE 39,9 s dan keyin ketdi. Birinchi nomzoddan 1 s keyin yig'ishni yakunlaymiz (host/srflx ulguradi).
    let iceTimer = null
    session.on('icecandidate', (e) => {
      if (iceTimer) return
      iceTimer = setTimeout(() => { try { e.ready() } catch { /* sessiya tugagan */ } }, 1000)
    })
    session.on('ended', () => clearTimeout(iceTimer))
    session.on('failed', () => clearTimeout(iceTimer))
    session.on('accepted', () => this.emit('active', { dir, peer }))
    session.on('confirmed', () => { this.attachFromSession(); this.emit('active', { dir, peer }) })
    session.on('ended', () => { this.session = null; this.emit('ended', { peer }) })
    session.on('failed', (e) => { this.session = null; this.emit('ended', { peer, failed: true, cause: e && e.cause }) })

    if (dir === 'incoming') this.emit('incoming', { peer })
    else this.emit('outgoing', { peer })
  }

  attachRemote(pc) {
    if (!pc) return
    pc.addEventListener('track', (e) => {
      const a = this.ensureAudio()
      if (e.streams && e.streams[0]) a.srcObject = e.streams[0]
    })
  }
  attachFromSession() {
    try {
      const pc = this.session && this.session.connection
      if (!pc) return
      const tracks = pc.getReceivers().map((r) => r.track).filter(Boolean)
      if (tracks.length) this.ensureAudio().srcObject = new MediaStream(tracks)
    } catch { /* */ }
  }

  // NAT ortida ovoz ulanishi uchun STUN (OnlinePBX: stun:{domen}:3478 + Google zaxira)
  pcConfig() {
    const urls = ['stun:stun.l.google.com:19302']
    if (this.domain) urls.unshift(`stun:${this.domain}:3478`)
    return { iceServers: [{ urls }] }
  }
  callOpts() { return { mediaConstraints: { audio: true, video: false }, pcConfig: this.pcConfig() } }

  call(number) {
    if (!this.ua || this.state !== 'registered' || !this.domain) return false
    const t = String(number || '').replace(/[^\d+*#]/g, '')
    if (!t) return false
    this.ua.call(`sip:${t}@${this.domain}`, this.callOpts())
    return true
  }
  answer() { if (this.session && this.session.direction === 'incoming') this.session.answer(this.callOpts()) }
  hangup() { if (this.session) { try { this.session.terminate() } catch { /* */ } } }
}

export const phone = new WebRtcPhone()
