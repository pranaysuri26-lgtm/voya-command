require('dotenv').config()
const { app, BrowserWindow, ipcMain, shell, Menu, MenuItem, clipboard, nativeImage } = require('electron')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

// ─── Local DB + agents (only loaded when running without a Railway server) ────
let db = null
let agentManager = null
let scheduler = null

function hashPin(pin) {
  return crypto.createHash('sha256').update(String(pin).trim()).digest('hex')
}

function tryLoadLocal() {
  // ── Railway mode ────────────────────────────────────────────────────────────
  // All data flows through preload.js via HTTP/WebSocket to the Railway server.
  // Local SQLite and agent modules are not required.
  // Every IPC handler below already guards with `if (!db) return []` so the
  // app starts cleanly and the login screen connects straight to Railway.
  //
  // To restore standalone local-SQLite mode, uncomment the block below:
  //
  // try {
  //   db = require('./src/database/db')
  //   agentManager = require('./src/agents/agentManager')
  //   scheduler = require('./src/agents/scheduler')
  //   agentManager.setHighActivityCallback((depth) => {
  //     if (mainWindow && !mainWindow.isDestroyed()) {
  //       mainWindow.webContents.send('high-activity', { message: 'High activity — responses may be delayed', depth })
  //     }
  //   })
  //   return true
  // } catch (err) {
  //   console.warn('[Main] Local agents not available:', err.message)
  //   return false
  // }

  return false
}

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0d0d0f',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.loadFile(path.join(__dirname, 'src/renderer/index.html'))

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  const userDataPath = app.getPath('userData')
  const localMode = tryLoadLocal()
  if (localMode && db) db.initialize(userDataPath)

  const menu = Menu.buildFromTemplate([
    { role: 'appMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ])
  Menu.setApplicationMenu(menu)

  createWindow()
  if (localMode && scheduler) scheduler.start(mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ─── Local IPC helpers ────────────────────────────────────────────────────────
// All handlers guard with `if (!db)` so they fail gracefully when running in
// Railway / server mode (no local SQLite). The preload uses HTTP in that case.

ipcMain.handle('get-first-launch', () => {
  if (!db) return false
  return db.getState('first_launch_done') !== '1'
})

ipcMain.handle('set-first-launch-done', () => {
  if (!db) return
  db.setState('first_launch_done', '1')
})

ipcMain.handle('trigger-welcome', async () => {
  if (!agentManager) return { content: null, error: 'No local agents' }
  try {
    const content = await agentManager.triggerWelcomeBriefing()
    return { content, error: null }
  } catch (err) {
    return { content: null, error: err.message }
  }
})

// ─── Messages ─────────────────────────────────────────────────────────────────

ipcMain.handle('send-message', async (event, { agent, content, attachments = [], senderRole = 'chairman' }) => {
  if (!agentManager) return { content: null, approvals: [], error: 'No local agents' }
  try {
    const { embedTextAttachments } = require('./src/agents/claude')
    const result = await agentManager.sendMessage(agent, content, null, attachments, senderRole)

    for (const approval of result.approvals) {
      mainWindow.webContents.send('new-approval', approval)
    }

    if (result.openDiscussion) {
      const { discussionId, topic, participants, reason, triggerAgent } =
        await agentManager.openDiscussionFromAgent(result.openDiscussion.topic, result.openDiscussion.reason, agent)
      mainWindow.webContents.send('auto-discussion', { discussionId, topic, participants, reason, triggerAgent })
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('oversight-direct-message', {
        id: `msg-${Date.now()}-${agent}`,
        thread_id: null,
        sender: agent,
        content: result.content,
        timestamp: new Date().toISOString(),
        thread_name: `Direct — ${agent}`,
        source_type: 'direct',
      })
    }

    return { content: result.content, approvals: result.approvals, openDiscussion: result.openDiscussion, error: null }
  } catch (err) {
    const errorMsg = `⚠️ ${err.message}`
    if (db) db.addMessage(agent, 'agent', errorMsg)
    return { content: errorMsg, approvals: [], error: err.message }
  }
})

ipcMain.handle('get-conversation', (event, { agent }) => {
  if (!db) return []
  return db.getConversation(agent)
})

// ─── Discussions ──────────────────────────────────────────────────────────────

ipcMain.handle('start-discussion', async (event, { topic, participants }) => {
  if (!db || !agentManager) return { discussionId: null, topic, participants: [] }
  const resolvedParticipants = participants || agentManager.selectParticipants(topic)
  const discussionId = db.createDiscussion(topic, resolvedParticipants)
  _launchDiscussion(discussionId, topic)
  return { discussionId, topic, participants: resolvedParticipants }
})

function _launchDiscussion(discussionId, topic) {
  setImmediate(async () => {
    await agentManager.runDiscussion(discussionId, topic, (update) => {
      if (!mainWindow || mainWindow.isDestroyed()) return
      mainWindow.webContents.send('discussion-update', update)
      if (update.approvals?.length > 0) {
        for (const a of update.approvals) mainWindow.webContents.send('new-approval', a)
      }
      if (update.recommendation) db.setDiscussionRecommendation(discussionId, update.recommendation)
    })
  })
}

ipcMain.handle('accept-open-discussion', async (event, { discussionId, topic }) => {
  _launchDiscussion(discussionId, topic)
  return { discussionId }
})

ipcMain.handle('get-discussions', () => {
  if (!db) return []
  return db.getDiscussions()
})

ipcMain.handle('get-discussion-messages', (event, { id }) => {
  if (!db) return { discussion: null, messages: [] }
  return { discussion: db.getDiscussion(id), messages: db.getDiscussionMessages(id) }
})

// ─── Approvals ────────────────────────────────────────────────────────────────

ipcMain.handle('get-approvals', (event, { status = 'inbox' } = {}) => {
  if (!db) return []
  return db.getApprovals(status)
})

ipcMain.handle('get-pending-count', () => {
  if (!db) return 0
  return db.getPendingCount()
})

ipcMain.handle('resolve-approval', async (event, { id, status, notes, decidedBy = 'chairman' }) => {
  if (!db || !agentManager) return { approval: null, pendingCount: 0 }
  const approval = db.resolveApproval(id, status, notes, decidedBy)
  const pendingCount = db.getPendingCount()

  if (approval && approval.type === 'thread_creation' && status === 'approved') {
    setImmediate(async () => {
      try {
        const meta = JSON.parse(approval.metadata || '{}')
        const threadId = db.createThread(meta.name, meta.members || [], 0)
        db.addThreadMessage(threadId, 'system', `Thread created by ${approval.agent} · Approved by Chairman`)
        const thread = db.getThread(threadId)
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('thread-created', { thread })
        }
      } catch (err) {
        console.error('[Thread creation]', err.message)
      }
    })
    return { approval, pendingCount }
  }

  if (approval && status !== 'withdrawn' && status !== 'held' && approval.type !== 'thread_creation') {
    setTimeout(async () => {
      try {
        const result = await agentManager.notifyResolution(approval.agent, approval.title, status, notes)
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('agent-acknowledgment', {
            agent: approval.agent, content: result.content,
            notification: result.notification, approvalTitle: approval.title,
            status, timestamp: new Date().toISOString(),
          })
          for (const a of result.approvals) mainWindow.webContents.send('new-approval', a)
        }
      } catch (err) {
        console.error('[Resolution notify] Failed:', err.message)
      }
    }, 500)
  }

  return { approval, pendingCount }
})

ipcMain.handle('get-decisions', (event, { query } = {}) => {
  if (!db) return []
  return db.getDecisions(query)
})

// ─── Threads ──────────────────────────────────────────────────────────────────

ipcMain.handle('create-thread', (event, { name, members }) => {
  if (!db) return null
  const threadId = db.createThread(name, members, 0)
  return db.getThread(threadId)
})

ipcMain.handle('get-threads', () => {
  if (!db) return []
  return db.getThreadsWithDetails()
})

ipcMain.handle('get-thread', (event, { id }) => {
  if (!db) return { thread: null, messages: [] }
  return { thread: db.getThread(id), messages: db.getThreadMessages(id, 100) }
})

ipcMain.handle('send-thread-message', async (event, { threadId, content, attachments = [], senderRole = 'chairman' }) => {
  if (!db || !agentManager) return { messageId: null, error: 'No local agents' }
  const { embedTextAttachments } = require('./src/agents/claude')
  const { enrichedContent, imageAttachments } = embedTextAttachments(content, attachments)

  const savedMeta = []
  if (attachments.length > 0) {
    const dir = path.join(app.getPath('userData'), 'attachments', String(threadId))
    fs.mkdirSync(dir, { recursive: true })
    for (const att of attachments) {
      try {
        const safeName = `${Date.now()}-${att.name.replace(/[^a-z0-9._-]/gi, '_')}`
        const filePath = path.join(dir, safeName)
        if (att.base64) fs.writeFileSync(filePath, Buffer.from(att.base64, 'base64'))
        else if (att.text != null) fs.writeFileSync(filePath, att.text, 'utf8')
        savedMeta.push({ name: att.name, type: att.type, size: att.size })
      } catch (err) { console.error('[Attachment save]', err.message) }
    }
  }

  const sender = senderRole === 'vp' ? 'vp' : 'chairman'
  const msgId = db.addThreadMessage(threadId, sender, enrichedContent, savedMeta.length > 0 ? savedMeta : null)
  const saved = db.getThreadMessages(threadId, 1).find(m => m.id === msgId)

  setImmediate(() => _runThreadAgents(threadId, imageAttachments))

  return { messageId: msgId, sender, content, timestamp: saved?.timestamp || new Date().toISOString(), attachments: savedMeta }
})

ipcMain.handle('pin-thread', (event, { id, pinned }) => {
  if (!db) return null
  db.setThreadPinned(id, pinned)
  return db.getThread(id)
})

ipcMain.handle('archive-thread', (event, { id }) => {
  if (!db) return { id }
  db.archiveThread(id)
  return { id }
})

async function _runThreadAgents(threadId, currentAttachments = []) {
  if (!mainWindow || mainWindow.isDestroyed() || !agentManager) return
  const thread = db.getThread(threadId)
  try {
    await agentManager.runThreadAgentResponses(threadId, currentAttachments, (update) => {
      if (!mainWindow || mainWindow.isDestroyed()) return
      mainWindow.webContents.send('thread-update', { ...update, _threadName: thread?.name || '' })
      if (update.approvals?.length > 0) {
        for (const a of update.approvals) mainWindow.webContents.send('new-approval', a)
      }
    })
  } catch (err) {
    console.error('[Thread agents] Failed:', err.message)
  }
}

// ─── Oversight ────────────────────────────────────────────────────────────────

ipcMain.handle('get-oversight-messages', (event, { agentFilter = null, limit = 200 } = {}) => {
  if (!db) return []
  return db.getOversightMessages(limit, agentFilter || null)
})

// ─── VP Role ──────────────────────────────────────────────────────────────────

ipcMain.handle('get-vp-profile', () => {
  if (!db) return null
  const p = db.getVpProfile()
  if (!p) return null
  return { name: p.name, hasPin: !!p.pin_hash, badgeColor: p.badge_color || '#94A3B8' }
})

ipcMain.handle('get-vp-profile-with-notes', () => {
  if (!db) return null
  const p = db.getVpProfileWithNotes()
  if (!p) return null
  return { name: p.name, hasPin: !!p.pin_hash, badgeColor: p.badge_color || '#94A3B8', privateNotes: p.private_notes || '' }
})

ipcMain.handle('setup-vp-profile', (event, { name, pin }) => {
  if (!db) return { error: 'No local DB' }
  if (!pin || String(pin).length !== 4 || !/^\d{4}$/.test(String(pin))) return { error: 'PIN must be exactly 4 digits' }
  db.setupVpProfile(name || 'VP', hashPin(pin))
  return { success: true }
})

ipcMain.handle('update-vp-name', (event, { name }) => {
  if (!db) return { success: false }
  db.updateVpName(name || 'VP')
  return { success: true }
})

ipcMain.handle('update-vp-notes', (event, { notes }) => {
  if (!db) return { success: false }
  db.updateVpNotes(notes || '')
  return { success: true }
})

ipcMain.handle('verify-vp-pin', (event, { pin }) => {
  if (!db) return { valid: false }
  const p = db.getVpProfile()
  if (!p || !p.pin_hash) return { valid: false, reason: 'no_pin' }
  return { valid: hashPin(String(pin).trim()) === p.pin_hash }
})

ipcMain.handle('get-chairman-away', () => {
  if (!db) return null
  return db.getChairmanAway()
})

ipcMain.handle('set-chairman-away', async (event, { returnDate, note }) => {
  if (!db) return { success: false }
  db.setChairmanAway(returnDate, note)
  setImmediate(async () => {
    try {
      await agentManager.postAwayAnnouncement(returnDate, note, false)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('chairman-away-changed', db.getChairmanAway())
        mainWindow.webContents.send('threads-updated')
      }
    } catch (err) { console.error('[Away announcement]', err.message) }
  })
  return { success: true, awayInfo: db.getChairmanAway() }
})

ipcMain.handle('clear-chairman-away', async () => {
  if (!db) return { success: false }
  const awayInfo = db.getChairmanAway()
  const since = awayInfo?.since || null
  const summary = await agentManager.buildReturnSummary(since)
  db.clearChairmanAway()
  setImmediate(async () => {
    try {
      await agentManager.postAwayAnnouncement(null, null, true)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('chairman-away-changed', null)
        mainWindow.webContents.send('threads-updated')
      }
    } catch (err) { console.error('[Return announcement]', err.message) }
  })
  return { success: true, summary }
})

ipcMain.handle('get-vp-acting-decisions', () => {
  if (!db) return []
  return db.getVpActingDecisions()
})

// ─── Screenshot ────────────────────────────────────────────────────────────────

ipcMain.handle('take-screenshot', async () => {
  const image = await mainWindow.webContents.capturePage()
  const buffer = image.toPNG()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `vondrer-command-${timestamp}.png`
  const savePath = path.join(app.getPath('desktop'), filename)
  fs.writeFileSync(savePath, buffer)
  shell.showItemInFolder(savePath)
  return { path: savePath, filename }
})

// ─── Context menu ──────────────────────────────────────────────────────────────

ipcMain.on('show-context-menu', (event, { selectedText }) => {
  const menu = new Menu()
  if (selectedText) {
    menu.append(new MenuItem({ label: 'Copy', click: () => clipboard.writeText(selectedText) }))
    menu.append(new MenuItem({ type: 'separator' }))
  }
  menu.append(new MenuItem({
    label: 'Copy All Text',
    click: () => { if (selectedText) clipboard.writeText(selectedText) },
    enabled: !!selectedText,
  }))
  menu.popup({ window: BrowserWindow.fromWebContents(event.sender) })
})
