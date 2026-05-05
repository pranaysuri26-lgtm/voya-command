// ─── Browser-native voyaAPI ───────────────────────────────────────────────────
// Installed by index.jsx when window.voyaAPI is not already present (i.e. the
// app is running in a browser, not Electron where preload.js injects it).
//
// All HTTP calls use relative paths so the app works on any host.
// WebSocket URL is derived from window.location so https → wss automatically.

let _token = null
let _ws    = null
let _wsListeners = {}
let _wsReady     = false
let _wsQueue     = []

function setToken(t) { _token = t }

function _getWsUrl() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  const q     = _token ? `?token=${encodeURIComponent(_token)}` : ''
  return `${proto}://${location.host}${q}`
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } }
  if (_token) opts.headers['Authorization'] = `Bearer ${_token}`
  if (body !== undefined) opts.body = JSON.stringify(body)
  const res  = await fetch(path, opts)                 // relative URL — same origin
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

const GET    = (path)        => api('GET',    path)
const POST   = (path, body)  => api('POST',   path, body)
const PATCH  = (path, body)  => api('PATCH',  path, body)
const DELETE = (path)        => api('DELETE', path)

// ─── WebSocket ────────────────────────────────────────────────────────────────
let _keepaliveTimer = null

function connectWS() {
  try {
    _ws = new WebSocket(_getWsUrl())

    _ws.onopen = () => {
      _wsReady = true
      for (const fn of _wsQueue) fn()
      _wsQueue = []
      // Notify app that WS is connected
      for (const cb of (_wsListeners['ws-connected'] || [])) cb({})

      // Send a keepalive ping every 20s to prevent Railway proxy from
      // closing idle WebSocket connections
      if (_keepaliveTimer) clearInterval(_keepaliveTimer)
      _keepaliveTimer = setInterval(() => {
        if (_ws && _ws.readyState === WebSocket.OPEN) {
          _ws.send(JSON.stringify({ type: 'ping' }))
        }
      }, 20_000)
    }

    _ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        const { type, ...payload } = msg
        if (type === 'pong') return // ignore server pong replies
        for (const cb of (_wsListeners[type] || [])) cb(payload)
      } catch { /* ignore malformed */ }
    }

    _ws.onclose = () => {
      _wsReady = false
      if (_keepaliveTimer) { clearInterval(_keepaliveTimer); _keepaliveTimer = null }
      // Notify app that WS dropped
      for (const cb of (_wsListeners['ws-disconnected'] || [])) cb({})
      if (_token) setTimeout(connectWS, 3000)
    }

    _ws.onerror = () => { _wsReady = false }
  } catch (err) {
    console.warn('[WS] connect failed:', err.message)
    if (_token) setTimeout(connectWS, 5000)
  }
}

function wsOn(channel, callback) {
  if (!_wsListeners[channel]) _wsListeners[channel] = []
  _wsListeners[channel].push(callback)
  return () => {
    _wsListeners[channel] = (_wsListeners[channel] || []).filter(c => c !== callback)
  }
}

// ─── Channel map (mirrors preload.js) ────────────────────────────────────────
const CHANNEL_MAP = {
  'new-approval':             'new-approval',
  'discussion-update':        'discussion-update',
  'briefing-ready':           'briefing-ready',
  'agent-message':            'agent-message',  // raw WS event — used for shared/broadcast messages
  'agent-acknowledgment':     'agent-message',
  'auto-discussion':          'auto-discussion',
  'thread-update':            'thread-update',
  'thread-created':           'thread-created',
  'oversight-direct-message': 'agent-message',
  'chairman-away-changed':    'chairman-away-changed',
  'threads-updated':          'threads-updated',
  'approval-resolved':        'approval-resolved',
  'high-activity':            'high-activity',
  'direct-message':           'direct-message',
  'ws-connected':             'ws-connected',
  'ws-disconnected':          'ws-disconnected',
  'task-update':              'task-update',
}

// ─── Install ──────────────────────────────────────────────────────────────────
export function installWebAPI() {
  // Flag read by LoginScreen to show window.location.host instead of .env URL
  window.__VOYA_WEB__ = true

  window.voyaAPI = {

    // ── Auth ──────────────────────────────────────────────────────────────────
    login: async (email, password) => {
      const data = await POST('/auth/login', { email, password })
      setToken(data.token)
      connectWS()
      return data
    },
    register: async (email, password, name) => {
      const data = await POST('/auth/register', { email, password, name })
      setToken(data.token)
      connectWS()
      return data
    },
    setToken: (t) => { setToken(t); if (t) connectWS() },
    getMe: () => GET('/auth/me'),

    // ── App state ─────────────────────────────────────────────────────────────
    getFirstLaunch:    () => GET('/auth/first-launch').then(d => d.firstLaunch),
    setFirstLaunchDone:() => POST('/auth/first-launch-done'),
    triggerWelcome:    () => POST('/agents/welcome'),

    // ── Direct messages ───────────────────────────────────────────────────────
    sendMessage: (agent, content, attachments = [], senderRole = 'chairman', isBroadcast = false) =>
      POST(`/agents/${agent}/message`, { content, attachments, senderRole, isBroadcast }),
    getConversation: (agent) => GET(`/agents/${agent}/conversation`),

    // ── Threads ───────────────────────────────────────────────────────────────
    createThread: (name, members) => POST('/threads', { name, members }),
    getThreads:   () => GET('/threads'),
    getThread:    (id) =>
      GET(`/threads/${id}`).then(thread =>
        GET(`/threads/${id}/messages`).then(messages => ({ thread, messages }))
      ),
    sendThreadMessage: (threadId, content, attachments = [], senderRole = 'chairman') =>
      POST(`/threads/${threadId}/messages`, { content, attachments, senderRole }),
    pinThread:    (id, pinned) => PATCH(`/threads/${id}/pin`, { pinned }),
    archiveThread:(id)         => DELETE(`/threads/${id}`),

    // ── Approvals ─────────────────────────────────────────────────────────────
    getApprovals:    (status = 'inbox') => GET(`/approvals?status=${status}`),
    getPendingCount: () => GET('/approvals/count').then(d => d.count),
    resolveApproval: (id, status, notes, decidedBy = 'chairman') =>
      POST(`/approvals/${id}/resolve`, { status, notes, decidedBy }),

    // ── Discussions (legacy stubs — identical to preload.js) ──────────────────
    startDiscussion:      (topic, participants) => POST('/agents/discussion', { topic, participants }),
    acceptOpenDiscussion: ()  => Promise.resolve({}),
    getDiscussions:       ()  => Promise.resolve([]),
    getDiscussionMessages:()  => Promise.resolve({ discussion: null, messages: [] }),

    // ── Decisions ─────────────────────────────────────────────────────────────
    getDecisions: (query) =>
      GET(query ? `/decisions?q=${encodeURIComponent(query)}` : '/decisions'),

    // ── Tasks ─────────────────────────────────────────────────────────────────
    getTasks:    (status, owner) => {
      const p = new URLSearchParams()
      if (status) p.set('status', status)
      if (owner)  p.set('owner', owner)
      return GET(`/tasks${p.toString() ? '?' + p.toString() : ''}`)
    },
    createTask:  (data)     => POST('/tasks', data),
    updateTask:  (id, data) => fetch(`/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_token}` }, body: JSON.stringify(data) }).then(r => r.json()),
    deleteTask:  (id)       => fetch(`/tasks/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${_token}` } }).then(r => r.json()),

    // ── Daily Brief ───────────────────────────────────────────────────────────
    getDailyBrief: () => GET('/briefing/daily'),

    // ── Oversight ─────────────────────────────────────────────────────────────
    getOversightMessages: (agentFilter = null, limit = 200) => {
      const p = new URLSearchParams({ limit: String(limit) })
      if (agentFilter) p.set('agent', agentFilter)
      return GET(`/oversight?${p}`)
    },

    // ── VP role ───────────────────────────────────────────────────────────────
    getVpProfile:          () => GET('/vp/profile').catch(() => null),
    getVpProfileWithNotes: () => GET('/vp/profile/full').catch(() => null),
    setupVpProfile:   (name, pin)   => POST('/vp/profile', { name, pin }),
    updateVpName:     (name)        => POST('/vp/profile', { name }),
    updateVpNotes:    (notes)       =>
      GET('/vp/profile/full')
        .then(p => POST('/vp/profile', { name: p?.name, privateNotes: notes }))
        .catch(() => POST('/vp/profile', { privateNotes: notes })),
    verifyVpPin:      (pin)         => POST('/vp/verify-pin', { pin }).then(d => ({ valid: d.valid })),
    getChairmanAway:  ()            => GET('/vp/away').catch(() => null),
    setChairmanAway:  (returnDate, note) => POST('/vp/away', { returnDate, note }),
    clearChairmanAway:()            => DELETE('/vp/away'),
    getVpActingDecisions: ()        => GET('/oversight/decisions?q=').catch(() => []),

    // ── Electron-only stubs (not available in browser) ────────────────────────
    takeScreenshot:  () => Promise.reject(new Error('Screenshots not available in browser')),
    showContextMenu: () => {},

    // ── Real-time events ──────────────────────────────────────────────────────
    on: (channel, callback) => {
      const wsType = CHANNEL_MAP[channel]
      if (wsType) return wsOn(wsType, callback)
      return () => {} // unsubscribe noop for unmapped channels
    },
  }
}
