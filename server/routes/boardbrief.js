const express = require('express')
const router  = express.Router()
const { requireAuth }                      = require('../middleware/auth')
const agentManager                         = require('../agents/agentManager')
const broadcast                            = require('../ws/broadcast')
const { BRIEF_APP_CONTEXT, BRIEF_PROMPTS } = require('../agents/boardBriefPrompts')

// ─── POST /boardbrief/weekly ──────────────────────────────────────────────────
// Triggers all 5 agents to surface their unprompted weekly concern.
// Each agent answers: "what risk in my domain has nobody asked me about yet?"
// Results stream to hub via WebSocket (brief-* events).

router.post('/weekly', requireAuth, async (req, res) => {
  const agents = ['CPO', 'CMO', 'CTO', 'CFO', 'COO']

  res.json({ status: 'started', agents })

  broadcast.broadcast('brief-started', {
    message: 'Weekly board brief — each executive surfacing their top unprompted concern',
    agents,
    timestamp: new Date().toISOString(),
  })

  await Promise.allSettled(
    agents.map(async (agent) => {
      try {
        broadcast.broadcast('brief-agent-thinking', { agent, timestamp: new Date().toISOString() })

        const prompt = `${BRIEF_APP_CONTEXT}\n\n---\n\n${BRIEF_PROMPTS[agent]}`
        const result = await agentManager.sendMessage(agent, prompt, 'brief', [], 'chairman', null, 'brief')

        broadcast.broadcast('agent-message', {
          agent,
          content:   result.content,
          role:      'agent',
          source:    'brief',
          isShared:  true,
          timestamp: new Date().toISOString(),
        })
      } catch (err) {
        console.error(`[BoardBrief] ${agent} failed:`, err.message)
        broadcast.broadcast('brief-agent-error', { agent, error: err.message })
      }
    })
  )

  broadcast.broadcast('brief-complete', {
    message:   'Weekly board brief complete.',
    timestamp: new Date().toISOString(),
  })
})

module.exports = router
