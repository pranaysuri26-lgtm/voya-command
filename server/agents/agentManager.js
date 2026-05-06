const db = require('../db/queries')
const broadcast = require('../ws/broadcast')
const { callAgent, callAgentForDiscussion, callAgentAutonomous, callAgentInThread, embedTextAttachments, setQueueWarningCallback } = require('./claude')
const { randomUUID } = require('crypto')

// ─── Queue warning (FIX 1) ────────────────────────────────────────────────────
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
    const speakerLabel = senderRole === 'vp'
      ? `${name} (VP, currently acting with full Chairman authority)`
      : 'the Chairman'
    return `\n\nLEADERSHIP AUTHORITY — CHAIRMAN AWAY:
Chairman is AWAY until ${returnStr}. ${name} (VP) has FULL CHAIRMAN AUTHORITY during this period.
You are currently speaking with ${speakerLabel}. Address them accordingly — if speaking with ${name}, use "${name}" as their name; if speaking with Chairman, address them as "Chairman".
All decisions, approvals, and directives go through ${name} while Chairman is away.
When decisions are made, tag them as [VP ACTING · Chairman Away].${awayInfo.note ? `\nChairman's handoff note: "${awayInfo.note}"` : ''}`
  }

  if (senderRole === 'vp') {
    return `\n\nLEADERSHIP AUTHORITY:
This is a private 1-on-1 conversation with ${name} (VP — second in command). Address this person as "${name}" only.
The Chairman is NOT present in this conversation — do not tag or address the Chairman.
Treat ${name}'s input as recommendations; flag required actions with [NEEDS APPROVAL] for Chairman review.
${name} cannot authorize decisions independently.`
  }

  return `\n\nLEADERSHIP AUTHORITY:
This is a private 1-on-1 conversation with the CHAIRMAN. There is NO VP present in this conversation.
Address the person messaging you as "Chairman" only — never use any other name or title.
Do NOT tag, mention, or address the VP (${name}) in your response. The VP is not here.
Keep all responses directed solely at the Chairman.`
}

async function getCurrentVpContext(senderRole = 'chairman') {
  const vpProfile = await db.getVpProfile()
  const awayInfo = await db.getChairmanAway()
  return buildVpContext(vpProfile?.name || 'VP', awayInfo, senderRole)
}

// Topic-based participant selection for board discussions
const TOPIC_PATTERNS = [
  { re: /pric|revenue|monetis|monetiz|paywall|subscription|tier/i,             agents: ['CFO', 'CPO', 'CMO', 'COO'] },
  { re: /cost|spend|burn|budget|api cost|expenses/i,                            agents: ['CFO', 'CTO', 'COO'] },
  { re: /market|brand|content|instagram|reddit|tiktok|growth|acqui|viral/i,    agents: ['CMO', 'CPO', 'COO'] },
  { re: /product|feature|roadmap|ux|onboard|retention|user journey/i,          agents: ['CPO', 'CTO', 'CMO', 'COO'] },
  { re: /tech|architect|stack|api|build|infra|security|performance/i,          agents: ['CTO', 'CPO', 'CFO', 'COO'] },
  { re: /launch|ship|deadline|sprint|milestone|timeline|checklist/i,           agents: ['COO', 'CPO', 'CMO', 'CTO', 'CFO'] },
]
const ALL_AGENTS = ['CMO', 'CPO', 'CTO', 'CFO', 'COO']

function selectParticipants(topic) {
  for (const { re, agents } of TOPIC_PATTERNS) {
    if (re.test(topic)) return agents
  }
  return ALL_AGENTS
}

// ─── Build memory context block for an agent ─────────────────────────────────
async function buildMemoryContext(agent) {
  const [agentDecisions, agentTasks, memory] = await Promise.all([
    db.getAgentDecisionHistory(agent, 10),
    db.getTasksForAgent(agent),
    db.getAgentMemory(agent),
  ])

  let block = ''

  if (memory?.summary) {
    block += `\n\n## Your Memory Bank\n${memory.summary}`
  }

  if (agentDecisions.length > 0) {
    block += `\n\n## Your Decision History (last ${agentDecisions.length})\n`
    block += agentDecisions
      .map(d => `- [${d.outcome.toUpperCase()}] ${d.title} (${new Date(d.decided_at).toDateString()}): ${d.description}`)
      .join('\n')
  }

  if (agentTasks.length > 0) {
    block += `\n\n## Your Open Tasks\n`
    block += agentTasks
      .map(t => {
        const due = t.deadline ? ` — due ${t.deadline}` : ''
        const status = t.status === 'in_progress' ? '[IN PROGRESS]' : '[TODO]'
        return `${status} [${t.priority.toUpperCase()}] ${t.title}${due}`
      })
      .join('\n')
    block += `\nUpdate task status by including [TASK: same title | same owner | same deadline | same priority] in your response — or mark done with "DONE: task title".`
  }

  return block
}

// ─── Parse and persist tasks from agent response ──────────────────────────────
async function persistAgentTasks(agent, tasks) {
  const created = []
  for (const t of tasks || []) {
    try {
      const deadline = t.deadline && t.deadline !== 'null' ? t.deadline : null
      const task = await db.createTask(t.title, null, t.owner || agent, t.priority, deadline, 'agent', null)
      created.push(task)
    } catch (e) {
      console.error('[Tasks] Failed to create task:', e.message)
    }
  }
  return created
}


// MODE 1 — direct message to exactly one agent
async function sendMessage(agent, content, taskSource = null, attachments = [], senderRole = 'chairman', userId = null, overrideSource = null) {
  const userRole = senderRole === 'vp' ? 'vp' : 'chairman'
  const history = await db.getConversation(agent, 10, userId, userRole)
  const recentDecisions = await db.getRecentDecisions(10)
  const pendingApprovals = await db.getApprovals('pending')

  const { enrichedContent, imageAttachments } = embedTextAttachments(content, attachments)
  const storedSource = overrideSource || (senderRole === 'vp' ? 'vp' : (taskSource || 'manual'))
  await db.addMessage(agent, 'chairman', enrichedContent, storedSource, userId)

  const [vpContext, memoryContext] = await Promise.all([
    getCurrentVpContext(senderRole),
    buildMemoryContext(agent),
  ])
  const response = await callAgent(agent, history, enrichedContent, recentDecisions, pendingApprovals, imageAttachments, {}, vpContext, memoryContext)

  const responseSource = taskSource === 'cto' ? 'cto_response' : 'manual'
  await db.addMessage(agent, 'agent', response.content, responseSource, userId)

  const createdApprovals = []
  for (const a of response.approvals) {
    const id = await db.createApproval(agent, a.title, a.description)
    createdApprovals.push({ id, agent, ...a })
  }

  if (response.createThread) {
    const { name, members, reason } = response.createThread
    const id = await db.createApproval(
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

  // Persist any tasks the agent proposed
  const createdTasks = await persistAgentTasks(agent, response.tasks)

  return {
    content: response.content,
    approvals: createdApprovals,
    tasks: createdTasks,
    openDiscussion: response.openDiscussion || null,
  }
}

// MODE 2 — board discussion
async function runDiscussion(discussionId, topic, onUpdate) {
  const recentDecisions = await db.getRecentDecisions(4) // FIX 2: was 6
  const participants = await db.getDiscussionParticipants(discussionId) || selectParticipants(topic)
  const discussionSoFar = []

  for (const agent of participants) {
    onUpdate({ type: 'typing', discussionId, agent })

    try {
      const vpContext = await getCurrentVpContext()
      const result = await callAgentForDiscussion(agent, topic, discussionSoFar, recentDecisions, vpContext)

      await db.addDiscussionMessage(discussionId, agent, result.content)
      discussionSoFar.push({ agent, content: result.content })

      const createdApprovals = []
      for (const a of result.approvals) {
        const id = await db.createApproval(agent, a.title, a.description)
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

      if (result.recommendationReady) {
        await db.closeDiscussion(discussionId)
        onUpdate({ type: 'complete', discussionId, recommendation: result.content })
        return
      }
    } catch (err) {
      onUpdate({ type: 'error', discussionId, agent, content: `Error: ${err.message}` })
    }
  }

  await db.closeDiscussion(discussionId)
  onUpdate({ type: 'complete', discussionId })
}

async function triggerWelcomeBriefing() {
  const task = `You are starting your first day as Voya's COO. Give the Chairman (solo founder) a warm but professional welcome briefing. Cover:
1. Your role and how you'll support them
2. The other executives (CPO, CMO, CTO, CFO) and their domains
3. How to use this command center: direct message any agent, or open a board discussion to get multiple perspectives at once
4. Your first suggested action for Voya's launch

Keep it under 200 words. Be energising and focused.`

  const recentDecisions = await db.getRecentDecisions(3)
  const vpContext = await getCurrentVpContext()
  const result = await callAgentAutonomous('COO', task, recentDecisions, vpContext)
  await db.addMessage('COO', 'agent', result.content, 'autonomous')
  return result.content
}

async function triggerDailyBriefing() {
  const recentDecisions = await db.getRecentDecisions(4) // FIX 2: was 5
  const results = {}

  const tasks = {
    COO: 'Post your morning standup. Top 3 priorities for Voya today. 3 bullet points max.',
    CMO: "Post today's content idea. One specific Instagram/Reddit post concept. Include the hook, format, and target subreddit or hashtag.",
    CFO: 'Daily cost check-in. Estimate Claude API burn rate, flag cost risks, confirm we are under the $0.08/session ceiling.',
  }

  for (const [agent, task] of Object.entries(tasks)) {
    try {
      const vpContext = await getCurrentVpContext()
      const r = await callAgentAutonomous(agent, task, recentDecisions, vpContext)
      await db.addMessage(agent, 'agent', r.content, 'autonomous')
      results[agent] = { content: r.content, approvals: r.approvals }
    } catch (e) {
      results[agent] = { content: `Briefing error: ${e.message}`, approvals: [] }
    }
  }

  const allApprovals = []
  for (const [agent, res] of Object.entries(results)) {
    for (const a of res.approvals || []) {
      const id = await db.createApproval(agent, a.title, a.description)
      allApprovals.push({ id, agent, ...a })
    }
  }

  return { results, approvals: allApprovals }
}

async function notifyResolution(agent, approvalTitle, status, notes) {
  // No Claude API call — notifications caused 429 errors by firing outside the
  // main queue on every resolved approval. Instant hardcoded responses instead.
  const notification = `[Board resolution] Chairman ${status.toUpperCase()} your proposal: "${approvalTitle}".${notes ? ` Note: "${notes}"` : ''}`
  await db.addMessage(agent, 'chairman', notification, 'system')

  const responseContent = status === 'approved'
    ? `Understood — "${approvalTitle}" is approved. Moving forward.`
    : `Noted — "${approvalTitle}" was declined. I'll revisit the approach.`

  await db.addMessage(agent, 'agent', responseContent, 'autonomous')
  return { content: responseContent, approvals: [], notification }
}

async function openDiscussionFromAgent(topic, reason, triggerAgent) {
  const participants = selectParticipants(topic)
  const discussionId = await db.createDiscussion(topic, participants)
  return { discussionId, topic, participants, reason, triggerAgent }
}

const AGENT_MENTION_RE = /@(CPO|CMO|CTO|CFO|COO)/g
function extractMentions(content, members, sender) {
  const mentioned = new Set()
  const aiMembers = members.filter(m => !HUMAN_MEMBERS.has(m))
  for (const match of content.matchAll(AGENT_MENTION_RE)) {
    const name = match[1].toUpperCase()
    if (name !== sender && aiMembers.includes(name)) mentioned.add(name)
  }
  return [...mentioned]
}

async function _runOneAgent(agent, thread, history, recentDecisions, attachments, onUpdate) {
  onUpdate({ type: 'typing', threadId: thread.id, agent })
  const vpContext = await getCurrentVpContext()
  const result = await callAgentInThread(
    agent, thread.name, thread.members, history, recentDecisions, attachments, vpContext
  )
  if (!result.content) return null

  const msgId = await db.addThreadMessage(thread.id, agent, result.content)
  const msgs = await db.getThreadMessages(thread.id, 100)
  const saved = msgs.find(m => m.id === msgId)

  const createdApprovals = []
  for (const a of result.approvals) {
    const id = await db.createApproval(agent, a.title, a.description)
    createdApprovals.push({ id, agent, ...a })
  }

  if (result.createThread) {
    const { name, members: tm, reason } = result.createThread
    const id = await db.createApproval(
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

const MAX_CONTINUATION_ROUNDS = 2

// Human participants — never call AI for these
const HUMAN_MEMBERS = new Set(['VP', 'CHAIRMAN', 'vp', 'chairman'])

async function runThreadAgentResponses(threadId, currentAttachments = [], onUpdate) {
  const recentDecisions = await db.getRecentDecisions(4)
  const thread = await db.getThread(threadId)
  if (!thread) return

  // Only run AI responses for actual AI agents, skip human participants (VP, CHAIRMAN)
  const members = thread.members.filter(m => !HUMAN_MEMBERS.has(m))
  let history = await db.getThreadMessages(threadId, 20)

  // ── Smart targeting: if message @mentions specific agents, only they respond ──
  const lastHumanMsg = [...history].reverse().find(m => m.sender === 'chairman' || m.sender === 'vp')
  const round0Targets = lastHumanMsg
    ? (() => {
        const mentioned = extractMentions(lastHumanMsg.content, members, lastHumanMsg.sender)
        return mentioned.length > 0 ? mentioned : members
      })()
    : members

  // ── Round 0: all targeted agents fire IN PARALLEL ────────────────────────
  // Per-agent queues in claude.js ensure each agent serialises its own calls,
  // but agents don't block each other — so all 5 respond concurrently.
  const round0Results = await Promise.allSettled(
    round0Targets.map(agent =>
      _runOneAgent(agent, thread, history, recentDecisions, currentAttachments, onUpdate)
        .catch(err => { onUpdate({ type: 'error', threadId, agent, content: `Error: ${err.message}` }); return null })
    )
  )

  const round0MsgIds = new Set(
    round0Results.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean)
  )

  // Refresh history once after all round-0 responses are in
  if (round0MsgIds.size > 0) history = await db.getThreadMessages(threadId, 20)

  // ── Continuation rounds: agents @mentioned in round-0 responses ──────────
  let prevRoundMsgIds = round0MsgIds
  for (let round = 0; round < MAX_CONTINUATION_ROUNDS; round++) {
    const mentioned = new Set()
    for (const msg of history.filter(m => prevRoundMsgIds.has(m.id))) {
      for (const name of extractMentions(msg.content, members, msg.sender)) {
        mentioned.add(name)
      }
    }
    if (mentioned.size === 0) break

    history = await db.getThreadMessages(threadId, 20)
    const contResults = await Promise.allSettled(
      [...mentioned].map(agent =>
        _runOneAgent(agent, thread, history, recentDecisions, [], onUpdate)
          .catch(err => { onUpdate({ type: 'error', threadId, agent, content: `Error: ${err.message}` }); return null })
      )
    )

    const thisRoundMsgIds = new Set(
      contResults.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean)
    )
    prevRoundMsgIds = thisRoundMsgIds
    if (thisRoundMsgIds.size > 0) history = await db.getThreadMessages(threadId, 20)
    if (thisRoundMsgIds.size === 0) break
  }

  onUpdate({ type: 'done', threadId })
}

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function postAwayAnnouncement(returnDate, note, isReturn = false) {
  const threads = await db.getThreadsWithDetails()
  const boardRoom = threads.find(t => /board\s*room/i.test(t.name))
  if (!boardRoom) return

  const vpProfile = await db.getVpProfile()
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
    const recentDecisions = await db.getRecentDecisions(3)
    const result = await callAgentAutonomous('COO', task, recentDecisions, vpContext)
    await db.addThreadMessage(boardRoom.id, 'COO', result.content)
  } catch (err) {
    const fallback = isReturn
      ? `Chairman has returned. Normal authority structure restored. VP returns to deputy role.`
      : `Chairman has stepped away until ${returnStr}. ${vpName} is now acting with full authority.`
    await db.addThreadMessage(boardRoom.id, 'system', fallback)
    console.warn('[Away announcement] COO call failed, used fallback:', err.message)
  }
}

async function buildReturnSummary(since) {
  const vpDecisions = await db.getVpActingDecisions(since)
  const newThreads = since ? await db.getThreadsSince(since) : []

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
  getCurrentVpContext,
  buildMemoryContext,
}
