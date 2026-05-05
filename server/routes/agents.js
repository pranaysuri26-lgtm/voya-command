const express = require('express')
const router = express.Router()
const db = require('../db/queries')
const agentManager = require('../agents/agentManager')
const { requireAuth } = require('../middleware/auth')
const broadcast = require('../ws/broadcast')

// GET /agents/:agent/conversation
router.get('/:agent/conversation', requireAuth, async (req, res) => {
  try {
    const messages = await db.getConversation(req.params.agent, 40, req.user.id, req.user.role)
    res.json(messages)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /agents/:agent/message
router.post('/:agent/message', requireAuth, async (req, res) => {
  try {
    const { content, attachments = [], senderRole = 'chairman', isBroadcast = false } = req.body
    const agent = req.params.agent

    if (!content) return res.status(400).json({ error: 'content required' })

    // VP_DIRECT — human-to-human DM channel, no AI response
    if (agent === 'VP_DIRECT') {
      const storedSource = senderRole === 'vp' ? 'vp' : 'manual'
      await db.addMessage('VP_DIRECT', 'chairman', content, storedSource, null) // no userId scoping — shared DM channel
      const ts = new Date().toISOString()
      broadcast.broadcast('direct-message', { sender: storedSource, content, timestamp: ts })
      return res.json({ content: null, approvals: [], isDirect: true })
    }

    // Shared messages: broadcasts to all agents, or messages that @mention the other human user
    // Store with userId=null so both Chairman and VP can see them in history
    const mentionsOtherHuman = content.includes('@VP') || content.includes('@CHAIRMAN')
    const isShared = isBroadcast || mentionsOtherHuman
    const storageUserId = isShared ? null : req.user.id
    const storageSource = isShared ? 'broadcast' : (senderRole === 'vp' ? 'vp' : 'manual')

    const result = await agentManager.sendMessage(agent, content, null, attachments, senderRole, storageUserId, storageSource)

    // Broadcast to clients — isShared=true lets VP's client display it regardless of userId filter
    broadcast.broadcast('agent-message', {
      agent,
      userId: req.user.id,
      isShared,
      content: result.content,
      role: 'agent',
      source: storageSource,
      timestamp: new Date().toISOString(),
    })

    if (result.approvals?.length) {
      for (const a of result.approvals) {
        broadcast.broadcast('new-approval', a)
      }
    }

    // If agent requested a discussion, start it async
    if (result.openDiscussion) {
      const { topic, reason } = result.openDiscussion
      const participants = agentManager.selectParticipants(topic)
      const discussionId = await db.createDiscussion(topic, participants)
      agentManager.runDiscussion(discussionId, topic, (update) => {
        broadcast.broadcast('discussion-update', update)
        if (update.type === 'message' && update.approvals?.length) {
          for (const a of update.approvals) broadcast.broadcast('new-approval', a)
        }
      })
    }

    res.json(result)
  } catch (err) {
    console.error('[Agents] sendMessage error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST /agents/welcome
router.post('/welcome', requireAuth, async (req, res) => {
  try {
    const content = await agentManager.triggerWelcomeBriefing()
    broadcast.broadcast('agent-message', {
      agent: 'COO',
      content,
      role: 'agent',
      source: 'autonomous',
      timestamp: new Date().toISOString(),
    })
    res.json({ content })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /agents/discussion — start a board discussion
router.post('/discussion', requireAuth, async (req, res) => {
  try {
    const { topic } = req.body
    if (!topic) return res.status(400).json({ error: 'topic required' })

    const participants = agentManager.selectParticipants(topic)
    const discussionId = await db.createDiscussion(topic, participants)

    res.json({ discussionId, topic, participants })

    // Run async, broadcast updates
    agentManager.runDiscussion(discussionId, topic, (update) => {
      broadcast.broadcast('discussion-update', update)
      if (update.type === 'message' && update.approvals?.length) {
        for (const a of update.approvals) broadcast.broadcast('new-approval', a)
      }
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
