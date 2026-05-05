require('dotenv').config()
const Anthropic = require('@anthropic-ai/sdk')
const { AGENT_PROMPTS } = require('./prompts')

let client = null

function getClient() {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not set in .env file')
    }
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return client
}

// ─── Request queue (FIX 1) ────────────────────────────────────────────────────
// All Claude API calls are serialised through this queue so we never fire
// multiple requests simultaneously. A 2 s gap is enforced between each call.

const QUEUE_DELAY_MS   = 2000
const QUEUE_WARN_AT    = 10    // warn chairman when backlog reaches this

let _queue       = []
let _processing  = false
let _warnCb      = null   // set via setQueueWarningCallback()

/** Register a callback that fires when the queue depth hits QUEUE_WARN_AT. */
function setQueueWarningCallback(fn) { _warnCb = fn }

/** Wrap any async function so it runs in the serial queue. */
function enqueue(fn) {
  return new Promise((resolve, reject) => {
    _queue.push({ fn, resolve, reject })
    if (_queue.length >= QUEUE_WARN_AT && _warnCb) {
      _warnCb(_queue.length)
    }
    _drain()
  })
}

async function _drain() {
  if (_processing) return
  _processing = true
  while (_queue.length > 0) {
    const { fn, resolve, reject } = _queue.shift()
    try {
      resolve(await fn())
    } catch (err) {
      reject(err)
    }
    if (_queue.length > 0) {
      await _sleep(QUEUE_DELAY_MS)
    }
  }
  _processing = false
}

// ─── Exponential backoff retry (FIX 3) ───────────────────────────────────────
// On 429 rate-limit errors, wait 5 s → 10 s → 20 s before retrying.
// After three retries the error is re-thrown with a user-friendly message.

const RETRY_DELAYS = [5000, 10000, 20000]

function _is429(err) {
  return (
    err?.status === 429 ||
    err?.error?.type === 'rate_limit_error' ||
    String(err?.message).includes('rate_limit') ||
    String(err?.message).includes('429')
  )
}

async function _withRetry(agent, fn) {
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (_is429(err) && attempt < RETRY_DELAYS.length) {
        const wait = RETRY_DELAYS[attempt]
        console.warn(`[Claude] Rate limited (${agent}) — retrying in ${wait / 1000}s (attempt ${attempt + 1}/3)`)
        await _sleep(wait)
        continue
      }
      // Re-throw non-429 errors or exhausted retries with a clean message
      if (_is429(err)) {
        const friendly = new Error(`Agent ${agent} is experiencing high demand — retrying shortly`)
        friendly.rateLimited = true
        throw friendly
      }
      throw err
    }
  }
}

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ─── Flag parsers ─────────────────────────────────────────────────────────────

const OPEN_DISCUSSION_RE = /\[OPEN DISCUSSION:\s*([^|\]]+?)(?:\|([^\]]*))?\]/
const RECOMMENDATION_RE  = /\[RECOMMENDATION READY\]/
const CREATE_THREAD_RE   = /\[CREATE THREAD:\s*"([^"]+)"\s*\|\s*([^|]+)\|\s*([^\]]+)\]/i

function parseFlags(content) {
  const approvals = []
  let m
  const re = /\[NEEDS APPROVAL:\s*([^|]+)\|([^\]]+)\]/g
  while ((m = re.exec(content)) !== null) {
    approvals.push({ title: m[1].trim(), description: m[2].trim() })
  }

  const odMatch = OPEN_DISCUSSION_RE.exec(content)
  const openDiscussion = odMatch
    ? { topic: odMatch[1].trim(), reason: odMatch[2]?.trim() || '' }
    : null

  const recommendationReady = RECOMMENDATION_RE.test(content)

  const ctMatch = CREATE_THREAD_RE.exec(content)
  const createThread = ctMatch ? {
    name: ctMatch[1].trim(),
    members: ctMatch[2].split(',').map(s => s.trim()).filter(Boolean),
    reason: ctMatch[3].trim(),
  } : null

  return { approvals, openDiscussion, recommendationReady, createThread }
}

// ─── Attachment helpers ───────────────────────────────────────────────────────

function embedTextAttachments(content, attachments = []) {
  let enriched = content || ''
  const imageAtts = []
  for (const att of attachments) {
    const mime = att.type || ''
    if (mime.startsWith('image/')) {
      imageAtts.push(att)
    } else if (att.name) {
      enriched += `\n\n[Attached file: ${att.name}]\n\`\`\`\n${att.text || ''}\n\`\`\``
    }
  }
  return { enrichedContent: enriched, imageAttachments: imageAtts }
}

function buildContentWithAttachments(text, imageAttachments = []) {
  if (imageAttachments.length === 0) return text || ''
  const contentArray = []
  for (const att of imageAttachments) {
    if (att.base64) {
      contentArray.push({
        type: 'image',
        source: { type: 'base64', media_type: att.type || 'image/png', data: att.base64 },
      })
    }
  }
  if (text) contentArray.push({ type: 'text', text })
  return contentArray.length === 1 && contentArray[0].type === 'text'
    ? contentArray[0].text
    : contentArray
}

// ─── History trimming (FIX 2) ────────────────────────────────────────────────
// Cap conversation history at the last N messages before building API payload.
// Direct chat: 10 messages.  Thread: handled in buildThreadMessages (20 msgs).
const DIRECT_HISTORY_LIMIT  = 10
const THREAD_HISTORY_LIMIT  = 20
const DECISIONS_LIMIT       = 4   // recent decisions shown in system prompt
const PENDING_APPROVALS_LIMIT = 5 // pending approvals shown in system prompt

// ─── MODE 1 — direct 1-on-1 ──────────────────────────────────────────────────
async function callAgent(agent, conversationHistory, newMessage, recentDecisions = [], pendingApprovals = [], attachments = [], opts = {}, vpContext = '') {
  return enqueue(() => _withRetry(agent, () => _callAgent(agent, conversationHistory, newMessage, recentDecisions, pendingApprovals, attachments, opts, vpContext)))
}

async function _callAgent(agent, conversationHistory, newMessage, recentDecisions, pendingApprovals, attachments, opts, vpContext) {
  const model     = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6'
  const maxTokens = opts.maxTokens || 1024

  // Trim context (FIX 2)
  const trimmedHistory   = conversationHistory.slice(-DIRECT_HISTORY_LIMIT)
  const trimmedDecisions = recentDecisions.slice(0, DECISIONS_LIMIT)
  const trimmedPending   = pendingApprovals.slice(0, PENDING_APPROVALS_LIMIT)

  let systemPrompt = AGENT_PROMPTS[agent]

  if (trimmedDecisions.length > 0) {
    systemPrompt += '\n\nRECENT DECISIONS:\n'
    systemPrompt += trimmedDecisions
      .map(d => `- [${d.outcome.toUpperCase()}] ${d.title}: ${d.description}`)
      .join('\n')
  }

  if (trimmedPending.length > 0) {
    systemPrompt += '\n\nPENDING APPROVALS (awaiting Chairman):\n'
    systemPrompt += trimmedPending
      .map(a => `- ${a.title} (proposed by ${a.agent}): ${a.description}`)
      .join('\n')
  }

  if (vpContext) systemPrompt += vpContext
  systemPrompt += `\n\nToday: ${new Date().toDateString()}`

  // Build alternating message array from trimmed history
  const messages = []
  for (const msg of trimmedHistory) {
    const role = msg.role === 'chairman' ? 'user' : 'assistant'
    const last = messages[messages.length - 1]
    if (last && last.role === role) {
      last.content = last.content + '\n\n' + msg.content
    } else {
      messages.push({ role, content: msg.content })
    }
  }
  const userContent = attachments.length > 0
    ? buildContentWithAttachments(newMessage, attachments)
    : newMessage
  messages.push({ role: 'user', content: userContent })

  const response = await getClient().messages.create({ model, max_tokens: maxTokens, system: systemPrompt, messages })
  const content = response.content[0].text
  return { content, ...parseFlags(content) }
}

// ─── MODE 2 — board discussion ────────────────────────────────────────────────
async function callAgentForDiscussion(agent, topic, discussionSoFar, recentDecisions = [], vpContext = '') {
  return enqueue(() => _withRetry(agent, () => _callAgentForDiscussion(agent, topic, discussionSoFar, recentDecisions, vpContext)))
}

async function _callAgentForDiscussion(agent, topic, discussionSoFar, recentDecisions, vpContext) {
  const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6'

  let systemPrompt = AGENT_PROMPTS[agent]

  const trimmedDecisions = recentDecisions.slice(0, DECISIONS_LIMIT)
  if (trimmedDecisions.length > 0) {
    systemPrompt += '\n\nRECENT DECISIONS:\n'
    systemPrompt += trimmedDecisions
      .map(d => `- [${d.outcome.toUpperCase()}] ${d.title}: ${d.description}`)
      .join('\n')
  }

  if (vpContext) systemPrompt += vpContext
  systemPrompt += `\n\nToday: ${new Date().toDateString()}`

  let userContent = `Board discussion topic: "${topic}"`

  if (discussionSoFar.length > 0) {
    userContent += '\n\nDiscussion so far:\n'
    userContent += discussionSoFar.map(m => `[${m.agent}]: ${m.content}`).join('\n\n')
  }

  const mentions = discussionSoFar
    .filter(m => m.content.includes(`@${agent}`))
    .map(m => `[${m.agent}] addressed you: "${m.content}"`)

  if (mentions.length > 0) {
    userContent += `\n\nYou were directly addressed:\n${mentions.join('\n')}\nRespond to those specific points first.`
  }

  if (agent === 'COO') {
    userContent += '\n\nAs COO, synthesize the full discussion into a clear recommendation and one concrete next action for the Chairman. End your message with [RECOMMENDATION READY] when you have a final position.'
  } else {
    userContent += '\n\nAdd your perspective concisely. Use @AgentName to address specific colleagues directly.'
  }

  const response = await getClient().messages.create({
    model,
    max_tokens: 900,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  })
  const content = response.content[0].text
  return { content, ...parseFlags(content) }
}

// ─── MODE 2b — autonomous task ────────────────────────────────────────────────
async function callAgentAutonomous(agent, task, recentDecisions = [], vpContext = '') {
  return enqueue(() => _withRetry(agent, () => _callAgentAutonomous(agent, task, recentDecisions, vpContext)))
}

async function _callAgentAutonomous(agent, task, recentDecisions, vpContext) {
  const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6'

  let systemPrompt = AGENT_PROMPTS[agent]

  const trimmedDecisions = recentDecisions.slice(0, DECISIONS_LIMIT)
  if (trimmedDecisions.length > 0) {
    systemPrompt += '\n\nRECENT DECISIONS:\n'
    systemPrompt += trimmedDecisions
      .map(d => `- [${d.outcome.toUpperCase()}] ${d.title}: ${d.description}`)
      .join('\n')
  }

  if (vpContext) systemPrompt += vpContext
  systemPrompt += `\n\nToday: ${new Date().toDateString()}`

  const response = await getClient().messages.create({
    model,
    max_tokens: 600,
    system: systemPrompt,
    messages: [{ role: 'user', content: task }],
  })
  const content = response.content[0].text
  return { content, ...parseFlags(content) }
}

// ─── MODE 3 — agent in a multi-agent thread ───────────────────────────────────
function buildThreadMessages(agentKey, history, currentAttachments = []) {
  // FIX 2: trim to last THREAD_HISTORY_LIMIT messages before building API payload
  const trimmed = history.slice(-THREAD_HISTORY_LIMIT)

  const messages = []
  let pendingUserParts = []

  function flushUser(isLast = false) {
    if (pendingUserParts.length === 0) return
    const text = pendingUserParts.join('\n\n')
    const content = (isLast && currentAttachments.length > 0)
      ? buildContentWithAttachments(text, currentAttachments)
      : text
    messages.push({ role: 'user', content })
    pendingUserParts = []
  }

  for (let i = 0; i < trimmed.length; i++) {
    const msg = trimmed[i]
    const isLastMsg = i === trimmed.length - 1
    if (msg.sender === agentKey) {
      flushUser(false)
      messages.push({ role: 'assistant', content: msg.content })
    } else {
      const label = msg.sender === 'chairman' ? 'Chairman' : msg.sender
      pendingUserParts.push(`[${label}]: ${msg.content}`)
      if (isLastMsg) flushUser(true)
    }
  }
  if (pendingUserParts.length > 0) flushUser(true)
  return messages
}

async function callAgentInThread(agent, threadName, members, history, recentDecisions = [], currentAttachments = [], vpContext = '') {
  return enqueue(() => _withRetry(agent, () => _callAgentInThread(agent, threadName, members, history, recentDecisions, currentAttachments, vpContext)))
}

async function _callAgentInThread(agent, threadName, members, history, recentDecisions, currentAttachments, vpContext) {
  const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6'

  const otherMembers = members.filter(m => m !== agent)
  let systemPrompt = AGENT_PROMPTS[agent]

  systemPrompt += `\n\nYou are in a group thread called "${threadName}". Other participants: ${otherMembers.join(', ') || 'Chairman only'}.`
  systemPrompt += '\nRespond concisely to the latest message. You can address specific participants by name.'
  systemPrompt += `\nIMPORTANT: If your response requires input, a decision, or a reaction from a specific participant, tag them with @NAME (e.g. @CFO, @CTO, @CPO). This will notify them and they will respond directly to you. Use this to have real back-and-forth conversations — not just to inform, but to actively collaborate and reach conclusions together.`

  const trimmedDecisions = recentDecisions.slice(0, DECISIONS_LIMIT)
  if (trimmedDecisions.length > 0) {
    systemPrompt += '\n\nRECENT DECISIONS:\n'
    systemPrompt += trimmedDecisions.map(d => `- [${d.outcome.toUpperCase()}] ${d.title}: ${d.description}`).join('\n')
  }

  if (vpContext) systemPrompt += vpContext
  systemPrompt += `\n\nToday: ${new Date().toDateString()}`

  const messages = buildThreadMessages(agent, history, currentAttachments)
  if (messages.length === 0 || messages[0].role !== 'user') return { content: '', ...parseFlags('') }

  const response = await getClient().messages.create({ model, max_tokens: 900, system: systemPrompt, messages })
  const content = response.content[0].text
  return { content, ...parseFlags(content) }
}

module.exports = {
  callAgent,
  callAgentForDiscussion,
  callAgentAutonomous,
  callAgentInThread,
  embedTextAttachments,
  setQueueWarningCallback,
}
