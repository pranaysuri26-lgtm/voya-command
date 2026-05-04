const db = require('../database/db')
const { callAgent, callAgentForDiscussion, callAgentAutonomous, callAgentInThread, embedTextAttachments, setQueueWarningCallback } = require('./claude')

// ─── Queue warning (FIX 1) ────────────────────────────────────────────────────
// _onHighActivity is set from main.js so we can notify the chairman via IPC.
let _onHighActivity = null
function setHighActivityCallback(fn) {
  _onHighActivity = fn
  setQueueWarningCallback((depth) => {
    console.warn(`[Queue] Depth ${depth} — high activity`)
    if (_onHighActivity) _onHighActivity(depth)
  })
}

// ─── VP Context Builder ───────────────────────────────────────────────────────
function buildVpContext(vpName, awayInfo, senderRole = 'chairman') {
  const name = vpName || 'VP'

  if (awayInfo?.active) {
    let returnStr = 'further notice'
    if (awayInfo.returnDate) {
      try {
        returnStr = new Date(awayInfo.returnDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      } catch (_) { returnStr = awayInfo.returnDate }
    }
    return `\n\nLEADERSHIP AUTHORITY — CHAIRMAN AWAY:
Chairman is AWAY until ${returnStr}. ${name} (VP) has FULL CHAIRMAN AUTHORITY during this period.
You are currently speaking with ${senderRole === 'vp' ? name + ' (VP, acting as Chairman)' : 'Chairman'}.
Address ${name} exactly as you would address Chairman. All decisions, approvals, and directives go through ${name}.
When decisions are made, tag them as [VP ACTING · Chairman Away].${awayInfo.note ? `\nChairman's handoff note: "${awayInfo.note}"` : ''}`
  }

  if (senderRole === 'vp') {
    return `\n\nLEADERSHIP AUTHORITY:
Chairman is PRESENT and has ultimate authority. You are currently speaking with ${name} (VP — second in command).
Treat ${name}'s input as RECOMMENDATIONS to Chairman, not direct orders.
Acknowledge ${name}'s input professionally. Any required actions should be flagged with [NEEDS APPROVAL] for Chairman review.
${name} cannot authorize decisions independently.`
  }

  // Chairman present, Chairman speaking — minimal note for agent awareness
  return `\n\nLEADERSHIP AUTHORITY:
You are speaking with the Chairman (ultimate authority). ${name} (VP) is second in command and may also interact with you.`
}

// Shared helper — get current VP context from DB state
function getCurrentVpContext(senderRole = 'chairman') {
  const vpProfile = db.getVpProfile()
  const awayInfo = db.getChairmanAway()
  return buildVpContext(vpProfile?.name || 'VP', awayInfo, senderRole)
}

// Topic-based participant selection for board discussions
const TOPIC_PATTERNS = [
  { re: /pric|revenue|monetis|monetiz|paywall|subscription|tier/i, agents: ['CFO', 'CPO', 'CMO', 'COO'] },
  { re: /cost|spend|burn|budget|api cost|expenses/i,               agents: ['CFO', 'CTO', 'COO'] },
  { re: /market|brand|content|instagram|reddit|tiktok|growth|acqui|viral/i, agents: ['CMO', 'CPO', 'COO'] },
  { re: /product|feature|roadmap|ux|onboard|retention|user journey/i,       agents: ['CPO', 'CTO', 'CMO', 'COO'] },
  { re: /tech|architect|stack|api|build|infra|security|performance/i,        agents: ['CTO', 'CPO', 'CFO', 'COO'] },
  { re: /launch|ship|deadline|sprint|milestone|timeline|checklist/i,         agents: ['COO', 'CPO', 'CMO', 'CTO', 'CFO'] },
]
const ALL_AGENTS = ['CMO', 'CPO', 'CTO', 'CFO', 'COO']

function selectParticipants(topic) {
  for (const { re, agents } of TOPIC_PATTERNS) {
    if (re.test(topic)) return agents
  }
  return ALL_AGENTS
}

// MODE 1 — direct message to exactly one agent
async function sendMessage(agent, content, taskSource = null, attachments = [], senderRole = 'chairman') {
  const history = db.getConversation(agent, 10)    // FIX 2: was 30
  const recentDecisions = db.getRecentDecisions(4) // FIX 2: was 6
  const pendingApprovals = db.getApprovals('pending')

  // Embed text file contents into the stored message so they survive in conversation history.
  // Only image attachments are passed separately (as base64 vision blocks).
  const { enrichedContent, imageAttachments } = embedTextAttachments(content, attachments)
  const storedSource = senderRole === 'vp' ? 'vp' : (taskSource || 'manual')
  db.addMessage(agent, 'chairman', enrichedContent, storedSource)

  const vpContext = getCurrentVpContext(senderRole)
  const response = await callAgent(agent, history, enrichedContent, recentDecisions, pendingApprovals, imageAttachments, {}, vpContext)

  const responseSource = taskSource === 'cto' ? 'cto_response' : 'manual'
  db.addMessage(agent, 'agent', response.content, responseSource)

  const createdApprovals = []
  for (const a of response.approvals) {
    const id = db.createApproval(agent, a.title, a.description)
    createdApprovals.push({ id, agent, ...a })
  }

  // Agent wants to create a new thread — put it in the approval inbox
  if (response.createThread) {
    const { name, members, reason } = response.createThread
    const id = db.createApproval(
      agent,
      `Create thread: ${name}`,
      `${agent} wants to start a thread with ${members.join(', ')}. Reason: ${reason}`,
      'thread_creation',
      JSON.stringify({ name, members, reason })
    )
    createdApprovals.push({
      id, agent,
      title: `Create thread: ${name}`,
      description: `${agent} wants to start a thread with ${members.join(', ')}. Reason: ${reason}`,
      type: 'thread_creation',
      metadata: JSON.stringify({ name, members, reason }),
      status: 'pending',
      proposed_at: new Date().toISOString(),
    })
  }

  return {
    content: response.content,
    approvals: createdApprovals,
    openDiscussion: response.openDiscussion || null,
  }
}

// MODE 2 — board discussion with smart participant selection
async function runDiscussion(discussionId, topic, onUpdate) {
  const recentDecisions = db.getRecentDecisions(4) // FIX 2: was 6
  const participants = db.getDiscussionParticipants(discussionId) || selectParticipants(topic)
  const discussionSoFar = []

  for (const agent of participants) {
    onUpdate({ type: 'typing', discussionId, agent })

    try {
      const vpContext = getCurrentVpContext()
      const result = await callAgentForDiscussion(agent, topic, discussionSoFar, recentDecisions, vpContext)

      db.addDiscussionMessage(discussionId, agent, result.content)
      discussionSoFar.push({ agent, content: result.content })

      const createdApprovals = []
      for (const a of result.approvals) {
        const id = db.createApproval(agent, a.title, a.description)
        createdApprovals.push({ id, agent, ...a })
      }

      onUpdate({
        type: 'message',
        discussionId,
        agent,
        content: result.content,
        approvals: createdApprovals,
        recommendationReady: result.recommendationReady || false,
        isLast: agent === participants[participants.length - 1],
      })

      // COO posted RECOMMENDATION READY — archive discussion
      if (result.recommendationReady) {
        db.closeDiscussion(discussionId)
        onUpdate({ type: 'complete', discussionId, recommendation: result.content })
        return
      }
    } catch (err) {
      onUpdate({ type: 'error', discussionId, agent, content: `Error: ${err.message}` })
    }
  }

  db.closeDiscussion(discussionId)
  onUpdate({ type: 'complete', discussionId })
}

async function triggerWelcomeBriefing() {
  const task = `You are starting your first day as Voya's COO. Give the Chairman (solo founder) a warm but professional welcome briefing. Cover:
1. Your role and how you'll support them
2. The other executives (CPO, CMO, CTO, CFO) and their domains
3. How to use this command center: direct message any agent, or open a board discussion to get multiple perspectives at once
4. Your first suggested action for Voya's launch

Keep it under 200 words. Be energising and focused.`

  const recentDecisions = db.getRecentDecisions(3)
  const vpContext = getCurrentVpContext()
  const result = await callAgentAutonomous('COO', task, recentDecisions, vpContext)
  db.addMessage('COO', 'agent', result.content, 'autonomous')

  return result.content
}

async function triggerDailyBriefing() {
  const recentDecisions = db.getRecentDecisions(4) // FIX 2: was 5
  const results = {}

  const tasks = {
    COO: 'Post your morning standup. Top 3 priorities for Voya today. 3 bullet points max.',
    CMO: "Post today's content idea. One specific Instagram/Reddit post concept. Include the hook, format, and target subreddit or hashtag.",
    CFO: 'Daily cost check-in. Estimate Claude API burn rate, flag cost risks, confirm we are under the $0.08/session ceiling.',
  }

  for (const [agent, task] of Object.entries(tasks)) {
    try {
      const vpContext = getCurrentVpContext()
      const r = await callAgentAutonomous(agent, task, recentDecisions, vpContext)
      db.addMessage(agent, 'agent', r.content, 'autonomous')
      results[agent] = { content: r.content, approvals: r.approvals }
    } catch (e) {
      results[agent] = { content: `Briefing error: ${e.message}`, approvals: [] }
    }
  }

  const allApprovals = []
  for (const [agent, res] of Object.entries(results)) {
    for (const a of res.approvals || []) {
      const id = db.createApproval(agent, a.title, a.description)
      allApprovals.push({ id, agent, ...a })
    }
  }

  return { results, approvals: allApprovals }
}

async function notifyResolution(agent, approvalTitle, status, notes) {
  const verb = status === 'approved' ? 'APPROVED' : 'REJECTED'
  const instruction = status === 'approved'
    ? 'Acknowledge briefly. One concrete next step — 2 sentences max.'
    : 'Acknowledge briefly. One alternative or one clarifying question — 2 sentences max.'

  const notification = `[Board resolution] Chairman ${verb} your proposal: "${approvalTitle}".${notes ? ` Note: "${notes}"` : ''} ${instruction}`
  db.addMessage(agent, 'chairman', notification, 'system')

  // Try AI response; fall back to a deterministic acknowledgment so something always appears.
  let responseContent
  try {
    const history = db.getConversation(agent, 6)   // small window — notification only
    const vpContext = getCurrentVpContext()
    const result = await callAgent(agent, history, notification, [], [], [], { maxTokens: 256 }, vpContext)
    responseContent = result.content
  } catch (err) {
    console.warn(`[Resolution notify] API failed for ${agent}, using fallback:`, err.message)
    responseContent = status === 'approved'
      ? `Understood — "${approvalTitle}" is approved. Moving forward.`
      : `Noted — "${approvalTitle}" was declined. I'll revisit the approach.`
  }

  db.addMessage(agent, 'agent', responseContent, 'autonomous')

  return { content: responseContent, approvals: [], notification }
}

// Create a board discussion seeded by an agent's [OPEN DISCUSSION] flag
async function openDiscussionFromAgent(topic, reason, triggerAgent) {
  const participants = selectParticipants(topic)
  const discussionId = db.createDiscussion(topic, participants)
  return { discussionId, topic, participants, reason, triggerAgent }
}

// Detect @mentions of other thread members in a message
const AGENT_MENTION_RE = /@(CPO|CMO|CTO|CFO|COO|FORGE)/g
function extractMentions(content, members, sender) {
  const mentioned = new Set()
  for (const match of content.matchAll(AGENT_MENTION_RE)) {
    const name = match[1].toUpperCase()
    if (name !== sender && members.includes(name)) mentioned.add(name)
  }
  return [...mentioned]
}

// Run one agent's turn in a thread: call, store, emit, return msgId
async function _runOneAgent(agent, thread, history, recentDecisions, attachments, onUpdate) {
  onUpdate({ type: 'typing', threadId: thread.id, agent })
  const vpContext = getCurrentVpContext()
  const result = await callAgentInThread(
    agent, thread.name, thread.members, history, recentDecisions, attachments, vpContext
  )
  if (!result.content) return null

  const msgId = db.addThreadMessage(thread.id, agent, result.content)
  const saved = db.getThreadMessages(thread.id, 100).find(m => m.id === msgId)

  const createdApprovals = []
  for (const a of result.approvals) {
    const id = db.createApproval(agent, a.title, a.description)
    createdApprovals.push({ id, agent, ...a })
  }

  if (result.createThread) {
    const { name, members: tm, reason } = result.createThread
    const id = db.createApproval(
      agent,
      `Create thread: ${name}`,
      `${agent} wants to start a thread with ${tm.join(', ')}. Reason: ${reason}`,
      'thread_creation',
      JSON.stringify({ name, members: tm, reason })
    )
    createdApprovals.push({
      id, agent,
      title: `Create thread: ${name}`,
      description: `${agent} wants to start a thread with ${tm.join(', ')}.`,
      type: 'thread_creation',
      metadata: JSON.stringify({ name, members: tm, reason }),
      status: 'pending',
      proposed_at: new Date().toISOString(),
    })
  }

  onUpdate({
    type: 'message',
    threadId: thread.id,
    agent,
    messageId: msgId,
    content: result.content,
    timestamp: saved?.timestamp || new Date().toISOString(),
    approvals: createdApprovals,
  })

  return msgId
}

// Thread — each member agent responds sequentially, then agents can talk to each other
// via @mentions for up to MAX_CONTINUATION_ROUNDS autonomous back-and-forth rounds.
const MAX_CONTINUATION_ROUNDS = 2
const AGENT_STAGGER_MS = 3000  // FIX 4: 3 s between each agent in round 0

async function runThreadAgentResponses(threadId, currentAttachments = [], onUpdate) {
  const recentDecisions = db.getRecentDecisions(4) // FIX 2: was 6
  const thread = db.getThread(threadId)
  if (!thread) return

  const members = thread.members
  let history = db.getThreadMessages(threadId, 20) // FIX 2: was 100

  // ── Round 0: all thread members respond — staggered by AGENT_STAGGER_MS ───
  const round0MsgIds = new Set()
  for (let i = 0; i < members.length; i++) {
    const agent = members[i]
    // FIX 4: stagger — agent 0 fires immediately, each subsequent agent waits 3 s extra
    if (i > 0) await _sleep(AGENT_STAGGER_MS)
    try {
      const msgId = await _runOneAgent(agent, thread, history, recentDecisions, currentAttachments, onUpdate)
      if (msgId) {
        round0MsgIds.add(msgId)
        history = db.getThreadMessages(threadId, 20)
      }
    } catch (err) {
      onUpdate({ type: 'error', threadId, agent, content: `Error: ${err.message}` })
    }
  }

  // ── Continuation rounds: agent-to-agent via @mentions ─────────────────────
  let prevRoundMsgIds = round0MsgIds
  for (let round = 0; round < MAX_CONTINUATION_ROUNDS; round++) {
    const mentioned = new Set()
    for (const msg of history.filter(m => prevRoundMsgIds.has(m.id))) {
      for (const name of extractMentions(msg.content, members, msg.sender)) {
        mentioned.add(name)
      }
    }
    if (mentioned.size === 0) break

    const thisRoundMsgIds = new Set()
    history = db.getThreadMessages(threadId, 20)

    const mentionedArr = [...mentioned]
    for (let i = 0; i < mentionedArr.length; i++) {
      const agent = mentionedArr[i]
      if (i > 0) await _sleep(AGENT_STAGGER_MS)
      try {
        const msgId = await _runOneAgent(agent, thread, history, recentDecisions, [], onUpdate)
        if (msgId) {
          thisRoundMsgIds.add(msgId)
          history = db.getThreadMessages(threadId, 20)
        }
      } catch (err) {
        onUpdate({ type: 'error', threadId, agent, content: `Error: ${err.message}` })
      }
    }

    prevRoundMsgIds = thisRoundMsgIds
    if (thisRoundMsgIds.size === 0) break
  }

  onUpdate({ type: 'done', threadId })
}

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// Post COO announcement to Board Room when Chairman away mode changes
async function postAwayAnnouncement(returnDate, note, isReturn = false) {
  const threads = db.getThreadsWithDetails()
  const boardRoom = threads.find(t => /board\s*room/i.test(t.name))
  if (!boardRoom) return

  const vpProfile = db.getVpProfile()
  const vpName = vpProfile?.name || 'VP'

  let returnStr = 'further notice'
  if (returnDate) {
    try {
      returnStr = new Date(returnDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    } catch (_) { returnStr = returnDate }
  }

  const awayInfo = isReturn ? null : { active: true, returnDate, note }
  const vpContext = buildVpContext(vpName, awayInfo)

  const task = isReturn
    ? `Post a brief board announcement: Chairman has returned. Normal authority structure is restored. VP returns to deputy/advisory role. Standby for Chairman review of any decisions made during the absence. Keep it to 2-3 sentences.`
    : `Post a brief board announcement: Chairman has stepped away until ${returnStr}. ${vpName} (VP) is now acting with full authority. All decisions route to ${vpName} for approval.${note ? ` Chairman's handoff note: "${note}".` : ''} Agents should proceed accordingly. Keep it to 2-3 sentences.`

  try {
    const recentDecisions = db.getRecentDecisions(3)
    const result = await callAgentAutonomous('COO', task, recentDecisions, vpContext)
    db.addThreadMessage(boardRoom.id, 'COO', result.content)
  } catch (err) {
    // Fallback system message
    const fallback = isReturn
      ? `Chairman has returned. Normal authority structure restored. VP returns to deputy role.`
      : `Chairman has stepped away until ${returnStr}. ${vpName} is now acting with full authority. All decisions route to ${vpName} for approval.`
    db.addThreadMessage(boardRoom.id, 'system', fallback)
    console.warn('[Away announcement] COO call failed, used fallback:', err.message)
  }
}

// Build return summary for Chairman after they return from absence
async function buildReturnSummary(since) {
  const vpDecisions = db.getVpActingDecisions(since)
  const newThreads = since ? db.getThreadsSince(since) : []

  return {
    decisionCount: vpDecisions.length,
    decisions: vpDecisions.slice(0, 20),
    threadCount: newThreads.length,
    threads: newThreads.map(t => t.name),
    since,
  }
}

module.exports = {
  sendMessage,
  runDiscussion,
  runThreadAgentResponses,
  triggerWelcomeBriefing,
  triggerDailyBriefing,
  notifyResolution,
  openDiscussionFromAgent,
  selectParticipants,
  postAwayAnnouncement,
  buildReturnSummary,
  buildVpContext,
  setHighActivityCallback,
}
