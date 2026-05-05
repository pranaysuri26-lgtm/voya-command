const pool = require('./pool')

// ─── Messages ─────────────────────────────────────────────────────────────────

async function addMessage(agent, role, content, source = 'manual', userId = null) {
  const { rows } = await pool.query(
    'INSERT INTO messages (agent, role, content, source, user_id) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [agent, role, content, source, userId]
  )
  return rows[0].id
}

// Chairman sees their own messages AND legacy messages (user_id IS NULL, created before scoping was added)
// VP and other roles see ONLY their own messages — no cross-account visibility
async function getConversation(agent, limit = 40, userId = null, role = 'chairman') {
  let rows
  if (!userId) {
    // Unauthenticated fallback — return nothing
    return []
  }

  // VP_DIRECT is a shared DM channel — no user scoping, both users see all messages
  if (agent === 'VP_DIRECT') {
    ;({ rows } = await pool.query(
      'SELECT * FROM messages WHERE agent=$1 ORDER BY timestamp DESC LIMIT $2',
      [agent, limit]
    ))
    return rows.reverse()
  }

  if (role === 'chairman') {
    // Backward-compat: chairman sees their rows + legacy unscoped rows
    ;({ rows } = await pool.query(
      'SELECT * FROM messages WHERE agent=$1 AND (user_id=$2 OR user_id IS NULL) ORDER BY timestamp DESC LIMIT $3',
      [agent, userId, limit]
    ))
  } else {
    // VP sees:
    // 1. Their own messages and agent responses (user_id = VP's id)
    // 2. Autonomous agent messages (welcome briefings, proactive — user_id IS NULL, role='agent')
    // 3. Broadcast/shared messages — chairman messages sent to all or that @mention VP (source='broadcast')
    ;({ rows } = await pool.query(
      `SELECT * FROM messages WHERE agent=$1 AND (
        user_id=$2
        OR (user_id IS NULL AND role='agent')
        OR (user_id IS NULL AND source='broadcast')
      ) ORDER BY timestamp DESC LIMIT $3`,
      [agent, userId, limit]
    ))
  }
  return rows.reverse()
}

// ─── Approvals ────────────────────────────────────────────────────────────────

async function createApproval(agent, title, description, type = 'decision', metadata = null) {
  const { rows } = await pool.query(
    'INSERT INTO approvals (agent,title,description,type,metadata) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [agent, title, description, type, metadata]
  )
  return rows[0].id
}

async function getApprovals(status = 'pending') {
  if (status === 'all') {
    const { rows } = await pool.query('SELECT * FROM approvals ORDER BY proposed_at DESC')
    return rows
  }
  if (status === 'inbox') {
    const { rows } = await pool.query(
      `SELECT * FROM approvals WHERE status IN ('pending','held')
       ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, proposed_at DESC`
    )
    return rows
  }
  const { rows } = await pool.query(
    'SELECT * FROM approvals WHERE status=$1 ORDER BY proposed_at DESC',
    [status]
  )
  return rows
}

async function getPendingCount() {
  const { rows } = await pool.query(
    "SELECT COUNT(*) AS count FROM approvals WHERE status='pending'"
  )
  return parseInt(rows[0].count)
}

async function resolveApproval(id, status, notes = null, decidedBy = 'chairman') {
  await pool.query(
    'UPDATE approvals SET status=$1, resolved_at=NOW(), notes=$2 WHERE id=$3',
    [status, notes, id]
  )
  const { rows } = await pool.query('SELECT * FROM approvals WHERE id=$1', [id])
  const approval = rows[0]
  if (approval && status !== 'held') {
    await pool.query(
      'INSERT INTO decisions (agent,title,description,outcome,notes,decided_by) VALUES ($1,$2,$3,$4,$5,$6)',
      [approval.agent, approval.title, approval.description, status, notes, decidedBy]
    )
  }
  return approval
}

// ─── Decisions ────────────────────────────────────────────────────────────────

async function getDecisions(query = null, limit = 100) {
  if (query) {
    const { rows } = await pool.query(
      `SELECT * FROM decisions WHERE title ILIKE $1 OR description ILIKE $1 OR agent ILIKE $1
       ORDER BY decided_at DESC LIMIT $2`,
      [`%${query}%`, limit]
    )
    return rows
  }
  const { rows } = await pool.query(
    'SELECT * FROM decisions ORDER BY decided_at DESC LIMIT $1',
    [limit]
  )
  return rows
}

async function getRecentDecisions(limit = 8) {
  const { rows } = await pool.query(
    'SELECT * FROM decisions ORDER BY decided_at DESC LIMIT $1',
    [limit]
  )
  return rows
}

async function getVpActingDecisions(since = null) {
  if (since) {
    const { rows } = await pool.query(
      "SELECT * FROM decisions WHERE decided_by='vp_acting' AND decided_at>=$1 ORDER BY decided_at DESC",
      [since]
    )
    return rows
  }
  const { rows } = await pool.query(
    "SELECT * FROM decisions WHERE decided_by='vp_acting' ORDER BY decided_at DESC"
  )
  return rows
}

// ─── Discussions ──────────────────────────────────────────────────────────────

async function createDiscussion(topic, participants = []) {
  const { rows } = await pool.query(
    'INSERT INTO discussions (topic,participants) VALUES ($1,$2) RETURNING id',
    [topic, JSON.stringify(participants)]
  )
  return rows[0].id
}

async function getDiscussionParticipants(id) {
  const { rows } = await pool.query('SELECT participants FROM discussions WHERE id=$1', [id])
  if (!rows[0]) return null
  try { return JSON.parse(rows[0].participants) } catch { return null }
}

async function setDiscussionRecommendation(id, recommendation) {
  await pool.query('UPDATE discussions SET recommendation=$1 WHERE id=$2', [recommendation, id])
}

async function getDiscussions(limit = 30) {
  const { rows } = await pool.query(
    'SELECT * FROM discussions ORDER BY created_at DESC LIMIT $1',
    [limit]
  )
  return rows
}

async function getDiscussion(id) {
  const { rows } = await pool.query('SELECT * FROM discussions WHERE id=$1', [id])
  return rows[0] || null
}

async function getDiscussionMessages(discussionId) {
  const { rows } = await pool.query(
    'SELECT * FROM discussion_messages WHERE discussion_id=$1 ORDER BY timestamp ASC',
    [discussionId]
  )
  return rows
}

async function addDiscussionMessage(discussionId, agent, content) {
  const { rows } = await pool.query(
    'INSERT INTO discussion_messages (discussion_id,agent,content) VALUES ($1,$2,$3) RETURNING id',
    [discussionId, agent, content]
  )
  return rows[0].id
}

async function closeDiscussion(id) {
  await pool.query("UPDATE discussions SET status='closed' WHERE id=$1", [id])
}

// ─── Oversight ────────────────────────────────────────────────────────────────

async function getOversightMessages(limit = 200, agentFilter = null) {
  const threadSql = `
    SELECT 'tm-' || tm.id AS id, tm.thread_id, tm.sender, tm.content, tm.timestamp,
           t.name AS thread_name, 'thread' AS source_type
    FROM thread_messages tm
    JOIN threads t ON tm.thread_id = t.id
    WHERE tm.sender NOT IN ('chairman','system','vp')`

  const directSql = `
    SELECT 'msg-' || m.id AS id, NULL::BIGINT AS thread_id, m.agent AS sender,
           m.content, m.timestamp,
           'Direct — ' || m.agent AS thread_name, 'direct' AS source_type
    FROM messages m
    WHERE m.role = 'agent'`

  if (agentFilter) {
    const { rows } = await pool.query(`
      SELECT * FROM (
        ${threadSql} AND tm.sender = $1
        UNION ALL
        ${directSql} AND m.agent = $1
      ) combined
      ORDER BY timestamp DESC LIMIT $2`,
      [agentFilter, limit]
    )
    return rows
  }

  const { rows } = await pool.query(`
    SELECT * FROM (
      ${threadSql}
      UNION ALL
      ${directSql}
    ) combined
    ORDER BY timestamp DESC LIMIT $1`,
    [limit]
  )
  return rows
}

// ─── Threads ──────────────────────────────────────────────────────────────────

async function createThread(name, memberAgents = [], pinned = 0) {
  const { rows } = await pool.query(
    'INSERT INTO threads (name,pinned) VALUES ($1,$2) RETURNING id',
    [name, pinned ? 1 : 0]
  )
  const threadId = rows[0].id
  for (const agent of memberAgents) {
    await pool.query(
      'INSERT INTO thread_members (thread_id,agent) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [threadId, agent]
    )
  }
  return threadId
}

async function getThreadsWithDetails(limit = 50) {
  const { rows: threads } = await pool.query(
    "SELECT * FROM threads WHERE status='active' ORDER BY pinned DESC, created_at DESC LIMIT $1",
    [limit]
  )
  for (const t of threads) {
    const { rows: members } = await pool.query(
      'SELECT agent FROM thread_members WHERE thread_id=$1',
      [t.id]
    )
    t.members = members.map(m => m.agent)

    const { rows: last } = await pool.query(
      'SELECT sender,content,timestamp FROM thread_messages WHERE thread_id=$1 ORDER BY timestamp DESC LIMIT 1',
      [t.id]
    )
    t.lastMessage = last[0] || null
  }
  return threads
}

async function getThread(id) {
  const { rows } = await pool.query('SELECT * FROM threads WHERE id=$1', [id])
  if (!rows[0]) return null
  const t = rows[0]
  const { rows: members } = await pool.query(
    'SELECT agent FROM thread_members WHERE thread_id=$1',
    [id]
  )
  t.members = members.map(m => m.agent)
  return t
}

async function getThreadMembers(threadId) {
  const { rows } = await pool.query(
    'SELECT agent FROM thread_members WHERE thread_id=$1',
    [threadId]
  )
  return rows.map(r => r.agent)
}

async function getThreadMessages(threadId, limit = 100) {
  const { rows } = await pool.query(
    'SELECT * FROM thread_messages WHERE thread_id=$1 ORDER BY timestamp ASC LIMIT $2',
    [threadId, limit]
  )
  return rows
}

async function addThreadMessage(threadId, sender, content, attachmentsMeta = null) {
  const att = attachmentsMeta && attachmentsMeta.length > 0
    ? JSON.stringify(attachmentsMeta) : null
  const { rows } = await pool.query(
    'INSERT INTO thread_messages (thread_id,sender,content,attachments) VALUES ($1,$2,$3,$4) RETURNING id',
    [threadId, sender, content, att]
  )
  return rows[0].id
}

async function setThreadPinned(id, pinned) {
  await pool.query('UPDATE threads SET pinned=$1 WHERE id=$2', [pinned ? 1 : 0, id])
}

async function archiveThread(id) {
  await pool.query("UPDATE threads SET status='archived' WHERE id=$1", [id])
}

async function unarchiveThread(id) {
  await pool.query("UPDATE threads SET status='active' WHERE id=$1", [id])
}

async function getArchivedThreads() {
  const { rows: threads } = await pool.query(
    "SELECT * FROM threads WHERE status='archived' ORDER BY created_at DESC LIMIT 50"
  )
  for (const t of threads) {
    const { rows: members } = await pool.query(
      'SELECT agent FROM thread_members WHERE thread_id=$1', [t.id]
    )
    t.members = members.map(m => m.agent)
    const { rows: last } = await pool.query(
      'SELECT sender,content,timestamp FROM thread_messages WHERE thread_id=$1 ORDER BY timestamp DESC LIMIT 1',
      [t.id]
    )
    t.lastMessage = last[0] || null
  }
  return threads
}

async function getThreadsSince(since) {
  if (!since) return []
  const { rows } = await pool.query(
    "SELECT * FROM threads WHERE created_at>=$1 AND status='active' ORDER BY created_at ASC",
    [since]
  )
  return rows
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

async function createTask(title, description, owner, priority, deadline, sourceType, sourceId) {
  const { rows } = await pool.query(
    `INSERT INTO tasks (title,description,owner,priority,deadline,source_type,source_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [title, description || null, owner || 'team', priority || 'medium', deadline || null, sourceType || 'manual', sourceId || null]
  )
  return rows[0]
}

async function getTasks(status = null, owner = null) {
  let q = 'SELECT * FROM tasks WHERE status != $1'
  const params = ['cancelled']
  if (status) { q += ` AND status=$${params.length + 1}`; params.push(status) }
  if (owner)  { q += ` AND owner=$${params.length + 1}`;  params.push(owner) }
  q += ' ORDER BY CASE priority WHEN \'urgent\' THEN 0 WHEN \'high\' THEN 1 WHEN \'medium\' THEN 2 ELSE 3 END, created_at DESC'
  const { rows } = await pool.query(q, params)
  return rows
}

async function getTasksForAgent(owner) {
  const { rows } = await pool.query(
    `SELECT * FROM tasks WHERE owner=$1 AND status NOT IN ('done','cancelled')
     ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, deadline ASC NULLS LAST`,
    [owner]
  )
  return rows
}

async function getOverdueTasks() {
  const { rows } = await pool.query(
    `SELECT * FROM tasks WHERE deadline < CURRENT_DATE AND status NOT IN ('done','cancelled')
     ORDER BY deadline ASC`
  )
  return rows
}

async function updateTask(id, fields) {
  const allowed = ['title','description','owner','status','priority','deadline','notes']
  const sets = []
  const vals = []
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.includes(k)) { sets.push(`${k}=$${vals.length + 1}`); vals.push(v) }
  }
  if (sets.length === 0) return null
  sets.push(`updated_at=NOW()`)
  vals.push(id)
  const { rows } = await pool.query(
    `UPDATE tasks SET ${sets.join(',')} WHERE id=$${vals.length} RETURNING *`,
    vals
  )
  return rows[0]
}

async function deleteTask(id) {
  await pool.query("UPDATE tasks SET status='cancelled' WHERE id=$1", [id])
}

// ─── Agent Memory ─────────────────────────────────────────────────────────────

async function getAgentMemory(agent) {
  const { rows } = await pool.query('SELECT * FROM agent_memories WHERE agent=$1', [agent])
  return rows[0] || null
}

async function setAgentMemory(agent, summary) {
  await pool.query(
    `INSERT INTO agent_memories (agent,summary,updated_at) VALUES ($1,$2,NOW())
     ON CONFLICT (agent) DO UPDATE SET summary=$2, updated_at=NOW()`,
    [agent, summary]
  )
}

async function getAgentDecisionHistory(agent, limit = 12) {
  const { rows } = await pool.query(
    'SELECT * FROM decisions WHERE agent=$1 ORDER BY decided_at DESC LIMIT $2',
    [agent, limit]
  )
  return rows
}

// ─── App State ────────────────────────────────────────────────────────────────

async function getState(key) {
  const { rows } = await pool.query('SELECT value FROM app_state WHERE key=$1', [key])
  return rows[0]?.value || null
}

async function setState(key, value) {
  await pool.query(
    'INSERT INTO app_state (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2',
    [key, value]
  )
}

// ─── VP Profile ───────────────────────────────────────────────────────────────

async function getVpProfile() {
  const { rows } = await pool.query(
    'SELECT id,name,badge_color,created_at FROM vp_profile WHERE id=1'
  )
  return rows[0] || null
}

async function getVpProfileWithNotes() {
  const { rows } = await pool.query('SELECT * FROM vp_profile WHERE id=1')
  return rows[0] || null
}

async function upsertVpProfile(name, badgeColor, privateNotes, pinHash) {
  if (pinHash !== undefined) {
    await pool.query(`
      INSERT INTO vp_profile (id,name,badge_color,private_notes,pin_hash) VALUES (1,$1,$2,$3,$4)
      ON CONFLICT (id) DO UPDATE SET name=$1, badge_color=$2, private_notes=$3, pin_hash=$4`,
      [name, badgeColor, privateNotes, pinHash]
    )
  } else {
    await pool.query(`
      INSERT INTO vp_profile (id,name,badge_color,private_notes) VALUES (1,$1,$2,$3)
      ON CONFLICT (id) DO UPDATE SET name=$1, badge_color=$2, private_notes=$3`,
      [name, badgeColor, privateNotes]
    )
  }
}

async function updateVpName(name) {
  const existing = await getVpProfile()
  if (existing) {
    await pool.query('UPDATE vp_profile SET name=$1 WHERE id=1', [name])
  } else {
    await pool.query('INSERT INTO vp_profile (id,name) VALUES (1,$1)', [name])
  }
}

async function updateVpNotes(notes) {
  const existing = await getVpProfile()
  if (existing) {
    await pool.query('UPDATE vp_profile SET private_notes=$1 WHERE id=1', [notes])
  } else {
    await pool.query('INSERT INTO vp_profile (id,private_notes) VALUES (1,$1)', [notes])
  }
}

// ─── Chairman Away Mode ───────────────────────────────────────────────────────

async function getChairmanAway() {
  const active = await getState('chairman_away')
  if (!active || active !== '1') return null
  return {
    active: true,
    returnDate: await getState('chairman_away_return'),
    note: await getState('chairman_away_note') || '',
    since: await getState('chairman_away_since'),
  }
}

async function setChairmanAway(returnDate, note) {
  await setState('chairman_away', '1')
  await setState('chairman_away_return', returnDate || '')
  await setState('chairman_away_note', note || '')
  await setState('chairman_away_since', new Date().toISOString())
}

async function clearChairmanAway() {
  await setState('chairman_away', '0')
}

// ─── Users (Auth) ─────────────────────────────────────────────────────────────

async function getUserByEmail(email) {
  const { rows } = await pool.query(
    'SELECT * FROM users WHERE email=$1',
    [email.toLowerCase()]
  )
  return rows[0] || null
}

async function createUser(email, passwordHash, role, name) {
  const { rows } = await pool.query(
    'INSERT INTO users (email,password_hash,role,name) VALUES ($1,$2,$3,$4) RETURNING id,email,role,name',
    [email.toLowerCase(), passwordHash, role, name || null]
  )
  return rows[0]
}

async function countUsers() {
  const { rows } = await pool.query('SELECT COUNT(*) AS count FROM users')
  return parseInt(rows[0].count)
}


async function getFirstLaunchDone() {
  const val = await getState('first_launch_done')
  return val === '1'
}

async function setFirstLaunchDone() {
  await setState('first_launch_done', '1')
}

module.exports = {
  addMessage, getConversation,
  createApproval, getApprovals, getPendingCount, resolveApproval,
  getDecisions, getRecentDecisions, getVpActingDecisions,
  createTask, getTasks, getTasksForAgent, getOverdueTasks, updateTask, deleteTask,
  getAgentMemory, setAgentMemory, getAgentDecisionHistory,
  createDiscussion, getDiscussionParticipants, setDiscussionRecommendation,
  getDiscussions, getDiscussion, getDiscussionMessages, addDiscussionMessage, closeDiscussion,
  getOversightMessages,
  createThread, getThreadsWithDetails, getThread, getThreadMembers,
  getThreadMessages, addThreadMessage, setThreadPinned, archiveThread, unarchiveThread, getArchivedThreads, getThreadsSince,
  getState, setState,
  getVpProfile, getVpProfileWithNotes, upsertVpProfile, updateVpName, updateVpNotes,
  getChairmanAway, setChairmanAway, clearChairmanAway,
  getUserByEmail, createUser, countUsers,
  getFirstLaunchDone, setFirstLaunchDone,
}
