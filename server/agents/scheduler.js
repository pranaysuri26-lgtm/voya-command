const cron = require('node-cron')
const agentManager = require('./agentManager')
const broadcast = require('../ws/broadcast')
const db = require('../db/queries')

// ─── Helper to broadcast discussion updates ───────────────────────────────────
function broadcastDiscussion(discussionId, topic, update) {
  broadcast.broadcast('discussion-update', update)
  if (update.type === 'message' && update.approvals?.length) {
    for (const a of update.approvals) broadcast.broadcast('new-approval', a)
  }
}

// ─── Rotating discussion topics ───────────────────────────────────────────────
const DISCUSSION_TOPICS = [
  'Voya launch readiness — what is our go/no-go checklist and who owns each item?',
  'First 100 users strategy — acquisition channels, content plan, and referral loops',
  'Product roadmap prioritization — what ships in v1 vs what waits for v2?',
  'Pricing and paywall optimization — where should the free/paid line be drawn?',
  'User onboarding flow — how do we get someone to their first "wow" moment in under 60 seconds?',
  'Content curation quality — how do we ensure every recommendation is genuinely underrated and beautiful?',
  'Growth experiments for next 30 days — what do we test, how do we measure, what is success?',
  'Technical performance targets — speed, AI cost ceiling, uptime SLA before launch',
  'Brand voice and visual identity — are we consistent across every touchpoint?',
  'Retention strategy — what brings a user back after their first session?',
]

let topicIndex = 0
function nextTopic() {
  const topic = DISCUSSION_TOPICS[topicIndex % DISCUSSION_TOPICS.length]
  topicIndex++
  return topic
}

// ─── Rotating individual agent tasks ─────────────────────────────────────────
const AGENT_PULSE_TASKS = {
  CPO: [
    'Give a quick product pulse: what is the single biggest UX risk before launch? One paragraph.',
    'What feature are you most worried about? Share your current thinking and one open question for the team.',
    'Audit the onboarding funnel in your head — where do you think users will drop off first?',
    'Share your current top priority and one blocker you need resolved this week.',
  ],
  CMO: [
    'Post one specific content idea you want to execute this week. Hook, format, and platform.',
    'What is the biggest marketing risk before launch? One paragraph, be direct.',
    'Share a growth hypothesis you want to test. What would prove it right or wrong?',
    'What does our Instagram grid look like 30 days post-launch? Paint the picture.',
  ],
  CTO: [
    'Quick tech health check: any architectural decisions that need revisiting before launch?',
    'What is the one technical risk that could delay launch? Be specific.',
    'Share your current take on AI model costs — are we within the $0.08/session ceiling?',
    'What is the next architectural decision that needs to be made before launch?',
  ],
  CFO: [
    'Quick burn check: what are our top 3 cost drivers right now and are any trending wrong?',
    'Model our unit economics at 100 users, 1000 users, and 10,000 users. Key numbers only.',
    'What financial metric should we be tracking daily before launch?',
    'Flag any spending decisions that should come to the Chairman this week.',
  ],
  COO: [
    'Operations pulse: what process is most broken right now and what would fix it?',
    'Rate our launch readiness 1-10 and explain the score in three sentences.',
    'What is the one thing the team needs to align on this week to stay on track?',
    'Quick cross-team dependency check: where are CPO, CMO, CTO, and CFO blocking each other?',
  ],
}

let pulseCounters = { CPO: 0, CMO: 0, CTO: 0, CFO: 0, COO: 0 }

async function triggerAgentPulse(agent) {
  const tasks = AGENT_PULSE_TASKS[agent]
  const task = tasks[pulseCounters[agent] % tasks.length]
  pulseCounters[agent]++

  const recentDecisions = await db.getRecentDecisions(4)
  const vpContext = await agentManager.getCurrentVpContext?.() || null

  const { callAgentAutonomous } = require('./claude')
  const result = await callAgentAutonomous(agent, task, recentDecisions, vpContext)
  await db.addMessage(agent, 'agent', result.content, 'autonomous')

  broadcast.broadcast('agent-message', {
    agent,
    content: result.content,
    role: 'agent',
    source: 'autonomous',
    timestamp: new Date().toISOString(),
  })

  return result
}

// ─── Start a fresh board discussion and broadcast updates ─────────────────────
async function triggerBoardDiscussion(topic) {
  console.log(`[Scheduler] Starting board discussion: ${topic}`)
  const participants = agentManager.selectParticipants(topic)
  const discussionId = await db.createDiscussion(topic, participants)

  agentManager.runDiscussion(discussionId, topic, (update) => {
    broadcastDiscussion(discussionId, topic, update)
  })

  return { discussionId, topic, participants }
}

function start() {
  // ── Nightly R2 database backup — 2am UTC ─────────────────────────────────
  // Only runs when R2 credentials are configured — safe no-op otherwise
  if (process.env.R2_ACCOUNT_ID && process.env.R2_BUCKET && process.env.R2_ACCESS_KEY_ID) {
    const { runBackup } = require('../backup/r2-backup')
    cron.schedule('0 2 * * *', async () => {
      try {
        console.log('[Scheduler] Starting nightly R2 backup...')
        await runBackup()
      } catch (err) {
        console.error('[Scheduler] R2 backup failed:', err.message)
      }
    })
    console.log('[Scheduler] R2 nightly backup registered (2am UTC)')
  } else {
    console.log('[Scheduler] R2 backup skipped — credentials not configured')
  }

  // ── Daily morning briefing — 9am ─────────────────────────────────────────
  cron.schedule('0 9 * * *', async () => {
    try {
      console.log('[Scheduler] Running daily briefing...')
      const result = await agentManager.triggerDailyBriefing()
      broadcast.broadcast('briefing-ready', {
        type: 'daily',
        results: result.results,
        approvals: result.approvals,
        timestamp: new Date().toISOString(),
      })
      for (const a of result.approvals) broadcast.broadcast('new-approval', a)
    } catch (err) {
      console.error('[Scheduler] Daily briefing failed:', err.message)
    }
  })

  // ── Agent pulse updates — every 90 minutes, rotating agents ──────────────
  // Each tick fires one agent so they don't all cluster together
  const PULSE_AGENTS = ['COO', 'CMO', 'CPO', 'CTO', 'CFO']
  let pulseAgentIdx = 0
  cron.schedule('*/90 * * * *', async () => {
    const agent = PULSE_AGENTS[pulseAgentIdx % PULSE_AGENTS.length]
    pulseAgentIdx++
    try {
      console.log(`[Scheduler] Agent pulse: ${agent}`)
      await triggerAgentPulse(agent)
    } catch (err) {
      console.error(`[Scheduler] Agent pulse failed (${agent}):`, err.message)
    }
  })

  // ── Board discussion — every 3 hours ──────────────────────────────────────
  cron.schedule('0 */3 * * *', async () => {
    try {
      const topic = nextTopic()
      await triggerBoardDiscussion(topic)
    } catch (err) {
      console.error('[Scheduler] Board discussion failed:', err.message)
    }
  })

  // ── Afternoon cross-check — 2pm, 5pm: 2 agents comment on each other's domain ──
  cron.schedule('0 14,17 * * *', async () => {
    const pairs = [['CMO', 'CPO'], ['CTO', 'CFO'], ['COO', 'CMO']]
    const [a1, a2] = pairs[Math.floor(Math.random() * pairs.length)]
    const topics = [
      `${a1} and ${a2} alignment check — where are our priorities in conflict and how do we resolve it?`,
      `Handoff between ${a1} and ${a2} this week — what does each side need from the other?`,
    ]
    try {
      await triggerBoardDiscussion(topics[Math.floor(Math.random() * topics.length)])
    } catch (err) {
      console.error('[Scheduler] Afternoon cross-check failed:', err.message)
    }
  })

  // ── Weekly board brief — Monday 8am ──────────────────────────────────────
  // Each agent surfaces their #1 unprompted concern for the week.
  // Broadcasts via brief-* WS events so the hub panel picks it up.
  cron.schedule('0 8 * * 1', async () => {
    try {
      console.log('[Scheduler] Running weekly board brief...')
      const agents   = ['CPO', 'CMO', 'CTO', 'CFO', 'COO']
      const broadcast = require('../ws/broadcast')
      const { BRIEF_PROMPTS, BRIEF_APP_CONTEXT } = require('./boardBriefPrompts')

      broadcast.broadcast('brief-started', {
        message: 'Weekly board brief — each executive surfacing their top unprompted concern',
        agents,
        timestamp: new Date().toISOString(),
        auto: true,
      })

      await Promise.allSettled(
        agents.map(async (agent) => {
          try {
            broadcast.broadcast('brief-agent-thinking', { agent, timestamp: new Date().toISOString() })
            const prompt = `${BRIEF_APP_CONTEXT}\n\n---\n\n${BRIEF_PROMPTS[agent]}`
            const result = await agentManager.sendMessage(agent, prompt, 'brief', [], 'chairman', null, 'brief')
            broadcast.broadcast('agent-message', {
              agent, content: result.content, role: 'agent',
              source: 'brief', isShared: true, timestamp: new Date().toISOString(),
            })
          } catch (err) {
            console.error(`[BoardBrief] ${agent} failed:`, err.message)
          }
        })
      )

      broadcast.broadcast('brief-complete', { message: 'Weekly board brief complete.', auto: true, timestamp: new Date().toISOString() })
    } catch (err) {
      console.error('[Scheduler] Weekly board brief failed:', err.message)
    }
  })
  console.log('[Scheduler] Weekly board brief registered (Monday 8am)')

  console.log('[Scheduler] Cron jobs registered')
}

// ─── Exported for on-demand use ───────────────────────────────────────────────
module.exports = { start, triggerBoardDiscussion, triggerAgentPulse, nextTopic }
