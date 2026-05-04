const { contextBridge, ipcRenderer } = require('electron')

// ─── Config ───────────────────────────────────────────────────────────────────
// SERVER_URL is injected by main.js via the preload environment or defaults.
// During development: http://localhost:3001
// In production: your Railway URL (set VOYA_SERVER_URL env var)
const SERVER_URL = (process.env.VOYA_SERVER_URL || 'http://localhost:3001').replace(/\/$/, '')
const WS_URL = SERVER_URL.replace(/^http/, 'ws')

// ─── Auth token (in-memory only) ─────────────────────────────────────────────
let _token = null
let _ws = null
let _wsListeners = {}   // { channel: [callback, ...] }
let _wsReady = false
let _wsQueue = []

function setToken(t) { _token = t }
function getToken() { return _token }

// ─── HTTP helper ─────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (_token) opts.headers['Authorization'] = `Bearer ${_token}`
  if (body !== undefined) opts.body = JSON.stringify(body)

  const res = await fetch(`${SERVER_URL}${path}`, opts)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

const GET    = (path)        => api('GET',    path)
const POST   = (path, body)  => api('POST',   path, body)
const PATCH  = (path, body)  => api('PATCH',  path, body)
const DELETE = (path)        => api('DELETE', path)

// ─── WebSocket ────────────────────────────────────────────────────────────────
function connectWS() {
  try {
    _ws = new WebSocket(`${WS_URL}?token=${_token || ''}`)

    _ws.onopen = () => {
      _wsReady = true
      // Flush any queued messages
      for (const fn of _wsQueue) fn()
      _wsQueue = []
    }

    _ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        const { type, ...payload } = msg
        const cbs = _wsListeners[type] || []
        for (const cb of cbs) cb(payload)
      } catch { /* ignore malformed messages */ }
    }

    _ws.onclose = () => {
      _wsReady = false
      // Reconnect after 3s if we have a token
      if (_token) setTimeout(connectWS, 3000)
    }

    _ws.onerror = () => {
      _wsReady = false
    }
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

// ─── Exposed API ─────────────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('voyaAPI', {

  // ── Auth ────────────────────────────────────────────────────────────────────
  login: async (email, password) => {
    const data = await POST('/auth/login', { email, password })
    setToken(data.token)
    connectWS()
    return data
  },

  register: async (email, password, name, inviteCode) => {
    const data = await POST('/auth/register', { email, password, name, inviteCode })
    setToken(data.token)
    connectWS()
    return data
  },

  setToken: (t) => {
    setToken(t)
    if (t) connectWS()
  },

  getMe: () => GET('/auth/me'),

  createInvite: () => POST('/auth/invite'),

  // ── App State ────────────────────────────────────────────────────────────────
  getFirstLaunch: () =>
    GET('/auth/first-launch').then(d => d.firstLaunch),

  setFirstLaunchDone: () =>
    POST('/auth/first-launch-done'),

  triggerWelcome: () =>
    POST('/agents/welcome'),

  // ── Direct Messages ──────────────────────────────────────────────────────────
  sendMessage: (agent, content, attachments = [], senderRole = 'chairman') =>
    POST(`/agents/${agent}/message`, { content, attachments, senderRole }),

  getConversation: (agent) =>
    GET(`/agents/${agent}/conversation`),

  // ── Threads ──────────────────────────────────────────────────────────────────
  createThread: (name, members) =>
    POST('/threads', { name, members }),

  getThreads: () =>
    GET('/threads'),

  getThread: (id) =>
    GET(`/threads/${id}`).then(thread =>
      GET(`/threads/${id}/messages`).then(messages => ({ thread, messages }))
    ),

  sendThreadMessage: (threadId, content, attachments = [], senderRole = 'chairman') =>
    POST(`/threads/${threadId}/messages`, { content, attachments, senderRole }),

  pinThread: (id, pinned) =>
    PATCH(`/threads/${id}/pin`, { pinned }),

  archiveThread: (id) =>
    DELETE(`/threads/${id}`),

  // ── Approvals ────────────────────────────────────────────────────────────────
  getApprovals: (status = 'inbox') =>
    GET(`/approvals?status=${status}`),

  getPendingCount: () =>
    GET('/approvals/count').then(d => d.count),

  resolveApproval: (id, status, notes, decidedBy = 'chairman') =>
    POST(`/approvals/${id}/resolve`, { status, notes, decidedBy }),

  // ── Discussions (legacy) ─────────────────────────────────────────────────────
  startDiscussion: (topic, participants) =>
    POST('/agents/discussion', { topic, participants }),

  acceptOpenDiscussion: (discussionId, topic) =>
    Promise.resolve({ discussionId }),

  getDiscussions: () =>
    Promise.resolve([]),

  getDiscussionMessages: () =>
    Promise.resolve({ discussion: null, messages: [] }),

  // ── Decisions ────────────────────────────────────────────────────────────────
  getDecisions: (query) =>
    GET(query ? `/decisions?q=${encodeURIComponent(query)}` : '/decisions'),

  // ── Oversight ────────────────────────────────────────────────────────────────
  getOversightMessages: (agentFilter = null, limit = 200) => {
    const params = new URLSearchParams({ limit: String(limit) })
    if (agentFilter) params.set('agent', agentFilter)
    return GET(`/oversight?${params.toString()}`)
  },

  // ── VP Role ──────────────────────────────────────────────────────────────────
  getVpProfile: () =>
    GET('/vp/profile').catch(() => null),

  getVpProfileWithNotes: () =>
    GET('/vp/profile/full').catch(() => null),

  setupVpProfile: (name, pin) =>
    POST('/vp/profile', { name, pin }),

  updateVpName: (name) =>
    POST('/vp/profile', { name }),

  updateVpNotes: (notes) =>
    GET('/vp/profile/full')
      .then(p => POST('/vp/profile', { name: p?.name, privateNotes: notes }))
      .catch(() => POST('/vp/profile', { privateNotes: notes })),

  verifyVpPin: (pin) =>
    POST('/vp/verify-pin', { pin }).then(d => ({ valid: d.valid })),

  getChairmanAway: () =>
    GET('/vp/away').catch(() => null),

  setChairmanAway: (returnDate, note) =>
    POST('/vp/away', { returnDate, note }),

  clearChairmanAway: () =>
    DELETE('/vp/away'),

  getVpActingDecisions: () =>
    GET('/oversight/decisions?q=').catch(() => []),

  // ── Screenshot (still via IPC — Electron only) ───────────────────────────────
  takeScreenshot: () =>
    ipcRenderer.invoke('take-screenshot'),

  // ── Context menu ─────────────────────────────────────────────────────────────
  showContextMenu: (selectedText) =>
    ipcRenderer.send('show-context-menu', { selectedText }),

  // ── Real-time events (WebSocket) ─────────────────────────────────────────────
  on: (channel, callback) => {
    // Map old IPC channel names to WS event types
    const channelMap = {
      'new-approval':           'new-approval',
      'discussion-update':      'discussion-update',
      'briefing-ready':         'briefing-ready',
      'agent-acknowledgment':   'agent-message',
      'auto-discussion':        'auto-discussion',
      'thread-update':          'thread-update',
      'thread-created':         'thread-created',
      'oversight-direct-message': 'agent-message',
      'chairman-away-changed':  'chairman-away-changed',
      'threads-updated':        'threads-updated',
      'approval-resolved':      'approval-resolved',
      'high-activity':          'high-activity',
    }

    const wsType = channelMap[channel]
    if (wsType) return wsOn(wsType, callback)

    // Fallback to IPC for any unmapped channels
    const sub = (_, data) => callback(data)
    ipcRenderer.on(channel, sub)
    return () => ipcRenderer.removeListener(channel, sub)
  },
})
