const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')

let db

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    source TEXT DEFAULT 'manual',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS vp_profile (
    id INTEGER PRIMARY KEY DEFAULT 1,
    name TEXT DEFAULT 'VP',
    pin_hash TEXT,
    badge_color TEXT DEFAULT '#94A3B8',
    private_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS approvals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    type TEXT DEFAULT 'decision',
    metadata TEXT,
    proposed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    outcome TEXT NOT NULL,
    decided_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS discussions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    participants TEXT DEFAULT '[]',
    recommendation TEXT,
    trigger_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS discussion_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discussion_id INTEGER NOT NULL REFERENCES discussions(id),
    agent TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS threads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    pinned INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS thread_members (
    thread_id INTEGER NOT NULL REFERENCES threads(id),
    agent TEXT NOT NULL,
    PRIMARY KEY (thread_id, agent)
  );

  CREATE TABLE IF NOT EXISTS thread_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id INTEGER NOT NULL REFERENCES threads(id),
    sender TEXT NOT NULL,
    content TEXT NOT NULL,
    attachments TEXT DEFAULT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`

function initialize(userDataPath) {
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true })
  }
  const dbPath = path.join(userDataPath, 'voya-command.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA)
  // Migrations for existing databases
  try { db.exec("ALTER TABLE discussions ADD COLUMN participants TEXT DEFAULT '[]'") } catch (_) {}
  try { db.exec("ALTER TABLE discussions ADD COLUMN recommendation TEXT") } catch (_) {}
  try { db.exec("ALTER TABLE discussions ADD COLUMN trigger_agent TEXT") } catch (_) {}
  try { db.exec("ALTER TABLE approvals ADD COLUMN type TEXT DEFAULT 'decision'") } catch (_) {}
  try { db.exec("ALTER TABLE approvals ADD COLUMN metadata TEXT") } catch (_) {}
  try { db.exec("ALTER TABLE thread_messages ADD COLUMN attachments TEXT DEFAULT NULL") } catch (_) {}
  try { db.exec("ALTER TABLE messages ADD COLUMN attachments TEXT DEFAULT NULL") } catch (_) {}
  try { db.exec("ALTER TABLE decisions ADD COLUMN decided_by TEXT DEFAULT 'chairman'") } catch (_) {}

  // Seed default threads on first run
  const threadCount = db.prepare('SELECT COUNT(*) as count FROM threads').get().count
  if (threadCount === 0) {
    _createThread('Board Room', ['CPO', 'CMO', 'CTO', 'CFO', 'COO', 'FORGE'], 1)
    _createThread('Engineering', ['CTO', 'FORGE'], 1)
    _createThread('Growth', ['CMO', 'CPO'], 0)
    _createThread('Finance Review', ['CFO', 'COO'], 0)
  }
}

// Messages
function addMessage(agent, role, content, source = 'manual') {
  return db.prepare(
    'INSERT INTO messages (agent, role, content, source) VALUES (?, ?, ?, ?)'
  ).run(agent, role, content, source).lastInsertRowid
}

function getConversation(agent, limit = 40) {
  return db.prepare(
    'SELECT * FROM messages WHERE agent = ? ORDER BY timestamp DESC LIMIT ?'
  ).all(agent, limit).reverse()
}

function getAllConversationSummary() {
  return db.prepare(
    `SELECT agent, COUNT(*) as count, MAX(timestamp) as last_message
     FROM messages GROUP BY agent`
  ).all()
}

// Approvals
function createApproval(agent, title, description, type = 'decision', metadata = null) {
  return db.prepare(
    'INSERT INTO approvals (agent, title, description, type, metadata) VALUES (?, ?, ?, ?, ?)'
  ).run(agent, title, description, type, metadata).lastInsertRowid
}

function getApprovals(status = 'pending') {
  if (status === 'all') {
    return db.prepare('SELECT * FROM approvals ORDER BY proposed_at DESC').all()
  }
  if (status === 'inbox') {
    // Pending first, then held — both stay actionable in the inbox
    return db.prepare(
      `SELECT * FROM approvals WHERE status IN ('pending','held')
       ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, proposed_at DESC`
    ).all()
  }
  return db.prepare(
    'SELECT * FROM approvals WHERE status = ? ORDER BY proposed_at DESC'
  ).all(status)
}

function getPendingCount() {
  return db.prepare("SELECT COUNT(*) as count FROM approvals WHERE status = 'pending'").get().count
}

function resolveApproval(id, status, notes = null, decidedBy = 'chairman') {
  db.prepare(
    'UPDATE approvals SET status = ?, resolved_at = CURRENT_TIMESTAMP, notes = ? WHERE id = ?'
  ).run(status, notes, id)

  const approval = db.prepare('SELECT * FROM approvals WHERE id = ?').get(id)
  // 'held' keeps the item alive — no decision record created until it's actioned
  if (approval && status !== 'held') {
    db.prepare(
      'INSERT INTO decisions (agent, title, description, outcome, notes, decided_by) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(approval.agent, approval.title, approval.description, status, notes, decidedBy)
  }
  return approval
}

// Decisions
function getDecisions(query = null, limit = 100) {
  if (query) {
    return db.prepare(
      `SELECT * FROM decisions WHERE title LIKE ? OR description LIKE ? OR agent LIKE ?
       ORDER BY decided_at DESC LIMIT ?`
    ).all(`%${query}%`, `%${query}%`, `%${query}%`, limit)
  }
  return db.prepare('SELECT * FROM decisions ORDER BY decided_at DESC LIMIT ?').all(limit)
}

function getRecentDecisions(limit = 8) {
  return db.prepare('SELECT * FROM decisions ORDER BY decided_at DESC LIMIT ?').all(limit)
}

// Discussions
function createDiscussion(topic, participants = []) {
  return db.prepare(
    'INSERT INTO discussions (topic, participants) VALUES (?, ?)'
  ).run(topic, JSON.stringify(participants)).lastInsertRowid
}

function getDiscussionParticipants(id) {
  const row = db.prepare('SELECT participants FROM discussions WHERE id = ?').get(id)
  if (!row || !row.participants) return null
  try { return JSON.parse(row.participants) } catch { return null }
}

function setDiscussionRecommendation(id, recommendation) {
  db.prepare('UPDATE discussions SET recommendation = ? WHERE id = ?').run(recommendation, id)
}

function getDiscussions(limit = 30) {
  return db.prepare('SELECT * FROM discussions ORDER BY created_at DESC LIMIT ?').all(limit)
}

function getDiscussion(id) {
  return db.prepare('SELECT * FROM discussions WHERE id = ?').get(id)
}

function getDiscussionMessages(discussionId) {
  return db.prepare(
    'SELECT * FROM discussion_messages WHERE discussion_id = ? ORDER BY timestamp ASC'
  ).all(discussionId)
}

function addDiscussionMessage(discussionId, agent, content) {
  return db.prepare(
    'INSERT INTO discussion_messages (discussion_id, agent, content) VALUES (?, ?, ?)'
  ).run(discussionId, agent, content).lastInsertRowid
}

function closeDiscussion(id) {
  db.prepare("UPDATE discussions SET status = 'closed' WHERE id = ?").run(id)
}

// Oversight — all agent messages across threads AND direct chats
function getOversightMessages(limit = 200, agentFilter = null) {
  // Thread messages (agent-to-agent and agent replies in threads)
  const threadSql = `
    SELECT 'tm-' || tm.id AS id, tm.thread_id, tm.sender, tm.content, tm.timestamp,
           t.name AS thread_name, 'thread' AS source_type
    FROM thread_messages tm
    JOIN threads t ON tm.thread_id = t.id
    WHERE tm.sender NOT IN ('chairman', 'system')`

  // Direct 1-on-1 chat: agent replies in the messages table
  const directSql = `
    SELECT 'msg-' || m.id AS id, NULL AS thread_id, m.agent AS sender, m.content, m.timestamp,
           'Direct — ' || m.agent AS thread_name, 'direct' AS source_type
    FROM messages m
    WHERE m.role = 'agent'`

  if (agentFilter) {
    const sql = `
      SELECT * FROM (
        ${threadSql} AND tm.sender = ?
        UNION ALL
        ${directSql} AND m.agent = ?
      ) ORDER BY timestamp DESC LIMIT ?`
    return db.prepare(sql).all(agentFilter, agentFilter, limit)
  }

  const sql = `
    SELECT * FROM (
      ${threadSql}
      UNION ALL
      ${directSql}
    ) ORDER BY timestamp DESC LIMIT ?`
  return db.prepare(sql).all(limit)
}

// Threads
function _createThread(name, memberAgents = [], pinned = 0) {
  const threadId = db.prepare('INSERT INTO threads (name, pinned) VALUES (?, ?)').run(name, pinned ? 1 : 0).lastInsertRowid
  const ins = db.prepare('INSERT OR IGNORE INTO thread_members (thread_id, agent) VALUES (?, ?)')
  for (const agent of memberAgents) ins.run(threadId, agent)
  return threadId
}

function createThread(name, memberAgents = [], pinned = 0) {
  return _createThread(name, memberAgents, pinned)
}

function getThreadsWithDetails(limit = 50) {
  const threads = db.prepare(
    "SELECT * FROM threads WHERE status = 'active' ORDER BY pinned DESC, created_at DESC LIMIT ?"
  ).all(limit)
  for (const t of threads) {
    t.members = db.prepare('SELECT agent FROM thread_members WHERE thread_id = ?').all(t.id).map(m => m.agent)
    t.lastMessage = db.prepare(
      'SELECT sender, content, timestamp FROM thread_messages WHERE thread_id = ? ORDER BY timestamp DESC LIMIT 1'
    ).get(t.id) || null
  }
  return threads
}

function getThread(id) {
  const t = db.prepare('SELECT * FROM threads WHERE id = ?').get(id)
  if (!t) return null
  t.members = db.prepare('SELECT agent FROM thread_members WHERE thread_id = ?').all(id).map(m => m.agent)
  return t
}

function getThreadMembers(threadId) {
  return db.prepare('SELECT agent FROM thread_members WHERE thread_id = ?').all(threadId).map(m => m.agent)
}

function getThreadMessages(threadId, limit = 100) {
  return db.prepare(
    'SELECT * FROM thread_messages WHERE thread_id = ? ORDER BY timestamp ASC LIMIT ?'
  ).all(threadId, limit)
}

function addThreadMessage(threadId, sender, content, attachmentsMeta = null) {
  const att = attachmentsMeta && attachmentsMeta.length > 0 ? JSON.stringify(attachmentsMeta) : null
  return db.prepare(
    'INSERT INTO thread_messages (thread_id, sender, content, attachments) VALUES (?, ?, ?, ?)'
  ).run(threadId, sender, content, att).lastInsertRowid
}

function setThreadPinned(id, pinned) {
  db.prepare('UPDATE threads SET pinned = ? WHERE id = ?').run(pinned ? 1 : 0, id)
}

function archiveThread(id) {
  db.prepare("UPDATE threads SET status = 'archived' WHERE id = ?").run(id)
}

// ─── VP Profile ──────────────────────────────────────────────────────────────

function getVpProfile() {
  return db.prepare('SELECT id, name, pin_hash, badge_color, created_at FROM vp_profile WHERE id = 1').get() || null
}

function getVpProfileWithNotes() {
  return db.prepare('SELECT * FROM vp_profile WHERE id = 1').get() || null
}

function setupVpProfile(name, pinHash) {
  const existing = db.prepare('SELECT id FROM vp_profile WHERE id = 1').get()
  if (existing) {
    db.prepare('UPDATE vp_profile SET name = ?, pin_hash = ? WHERE id = 1').run(name, pinHash)
  } else {
    db.prepare('INSERT INTO vp_profile (id, name, pin_hash) VALUES (1, ?, ?)').run(name, pinHash)
  }
}

function updateVpName(name) {
  const existing = db.prepare('SELECT id FROM vp_profile WHERE id = 1').get()
  if (existing) {
    db.prepare('UPDATE vp_profile SET name = ? WHERE id = 1').run(name)
  } else {
    db.prepare('INSERT INTO vp_profile (id, name) VALUES (1, ?)').run(name)
  }
}

function updateVpNotes(notes) {
  const existing = db.prepare('SELECT id FROM vp_profile WHERE id = 1').get()
  if (existing) {
    db.prepare('UPDATE vp_profile SET private_notes = ? WHERE id = 1').run(notes)
  } else {
    db.prepare('INSERT INTO vp_profile (id, private_notes) VALUES (1, ?)').run(notes)
  }
}

// ─── Chairman Away Mode (stored in app_state) ─────────────────────────────────

function getChairmanAway() {
  const active = db.prepare("SELECT value FROM app_state WHERE key = 'chairman_away'").get()
  if (!active || active.value !== '1') return null
  const returnDate = db.prepare("SELECT value FROM app_state WHERE key = 'chairman_away_return'").get()
  const note = db.prepare("SELECT value FROM app_state WHERE key = 'chairman_away_note'").get()
  const since = db.prepare("SELECT value FROM app_state WHERE key = 'chairman_away_since'").get()
  return {
    active: true,
    returnDate: returnDate?.value || null,
    note: note?.value || '',
    since: since?.value || null,
  }
}

function setChairmanAway(returnDate, note) {
  const ins = db.prepare('INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)')
  ins.run('chairman_away', '1')
  ins.run('chairman_away_return', returnDate || '')
  ins.run('chairman_away_note', note || '')
  ins.run('chairman_away_since', new Date().toISOString())
}

function clearChairmanAway() {
  db.prepare("INSERT OR REPLACE INTO app_state (key, value) VALUES ('chairman_away', '0')").run()
}

// ─── VP Acting Decisions ──────────────────────────────────────────────────────

function getVpActingDecisions(since = null) {
  if (since) {
    return db.prepare(
      "SELECT * FROM decisions WHERE decided_by = 'vp_acting' AND decided_at >= ? ORDER BY decided_at DESC"
    ).all(since)
  }
  return db.prepare(
    "SELECT * FROM decisions WHERE decided_by = 'vp_acting' ORDER BY decided_at DESC"
  ).all()
}

function getThreadsSince(since) {
  return db.prepare(
    "SELECT * FROM threads WHERE created_at >= ? AND status = 'active' ORDER BY created_at ASC"
  ).all(since)
}

// App state
function getState(key) {
  const row = db.prepare('SELECT value FROM app_state WHERE key = ?').get(key)
  return row ? row.value : null
}

function setState(key, value) {
  db.prepare('INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)').run(key, value)
}

module.exports = {
  initialize,
  addMessage,
  getConversation,
  getAllConversationSummary,
  createApproval,
  getApprovals,
  resolveApproval,
  getPendingCount,
  getDecisions,
  getRecentDecisions,
  createDiscussion,
  getDiscussionParticipants,
  setDiscussionRecommendation,
  getDiscussions,
  getDiscussion,
  getDiscussionMessages,
  addDiscussionMessage,
  closeDiscussion,
  getOversightMessages,
  createThread,
  getThreadsWithDetails,
  getThread,
  getThreadMembers,
  getThreadMessages,
  addThreadMessage,
  setThreadPinned,
  archiveThread,
  getState,
  setState,
  // VP
  getVpProfile,
  getVpProfileWithNotes,
  setupVpProfile,
  updateVpName,
  updateVpNotes,
  getChairmanAway,
  setChairmanAway,
  clearChairmanAway,
  getVpActingDecisions,
  getThreadsSince,
}
