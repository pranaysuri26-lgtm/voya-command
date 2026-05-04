const express = require('express')
const router = express.Router()
const db = require('../db/queries')
const agentManager = require('../agents/agentManager')
const { requireAuth } = require('../middleware/auth')
const broadcast = require('../ws/broadcast')

// GET /approvals?status=inbox|pending|all
router.get('/', requireAuth, async (req, res) => {
  try {
    const status = req.query.status || 'inbox'
    const approvals = await db.getApprovals(status)
    res.json(approvals)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /approvals/count
router.get('/count', requireAuth, async (req, res) => {
  try {
    const count = await db.getPendingCount()
    res.json({ count })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /approvals/:id/resolve
router.post('/:id/resolve', requireAuth, async (req, res) => {
  try {
    const { status, notes, decidedBy = 'chairman' } = req.body
    if (!status) return res.status(400).json({ error: 'status required' })

    const approval = await db.resolveApproval(req.params.id, status, notes, decidedBy)
    if (!approval) return res.status(404).json({ error: 'Approval not found' })

    broadcast.broadcast('approval-resolved', { id: approval.id, status, approval })

    // Handle thread creation approvals
    if (approval.type === 'thread_creation' && status === 'approved') {
      let meta
      try { meta = JSON.parse(approval.metadata) } catch { meta = null }
      if (meta?.name) {
        const threadId = await db.createThread(meta.name, meta.members || [], 0)
        const thread = await db.getThread(threadId)
        broadcast.broadcast('thread-created', { thread })
        broadcast.broadcast('threads-updated', {})
      }
    }

    // Notify the agent async
    if (status !== 'held') {
      agentManager.notifyResolution(approval.agent, approval.title, status, notes)
        .then(notif => {
          broadcast.broadcast('agent-message', {
            agent: approval.agent,
            content: notif.content,
            role: 'agent',
            source: 'autonomous',
            timestamp: new Date().toISOString(),
          })
        })
        .catch(err => console.error('[Approvals] notifyResolution error:', err.message))
    }

    res.json(approval)
  } catch (err) {
    console.error('[Approvals] resolve error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
