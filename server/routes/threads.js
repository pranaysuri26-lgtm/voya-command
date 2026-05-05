const express = require('express')
const router = express.Router()
const db = require('../db/queries')
const agentManager = require('../agents/agentManager')
const { requireAuth } = require('../middleware/auth')
const broadcast = require('../ws/broadcast')

// GET /threads
router.get('/', requireAuth, async (req, res) => {
  try {
    const threads = await db.getThreadsWithDetails()
    res.json(threads)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /threads
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, members = [], pinned = 0 } = req.body
    if (!name) return res.status(400).json({ error: 'name required' })
    const id = await db.createThread(name, members, pinned)
    const thread = await db.getThread(id)
    broadcast.broadcast('threads-updated', {})
    res.json(thread)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /threads/archived — list archived threads  ← must be before /:id
router.get('/archived', requireAuth, async (req, res) => {
  try {
    const threads = await db.getArchivedThreads()
    res.json(threads)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /threads/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const thread = await db.getThread(req.params.id)
    if (!thread) return res.status(404).json({ error: 'Thread not found' })
    res.json(thread)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /threads/:id/messages
router.get('/:id/messages', requireAuth, async (req, res) => {
  try {
    const messages = await db.getThreadMessages(req.params.id)
    res.json(messages)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /threads/:id/messages — human sends a message
router.post('/:id/messages', requireAuth, async (req, res) => {
  try {
    const { content, attachments = [], senderRole = 'chairman' } = req.body
    const threadId = parseInt(req.params.id)
    if (!content) return res.status(400).json({ error: 'content required' })

    const sender = senderRole === 'vp' ? 'vp' : 'chairman'
    // Store attachment metadata (strip large base64/text so DB stays small; keep name/type/size)
    const attMeta = attachments.map(a => ({ name: a.name, type: a.type, size: a.size }))
    const msgId = await db.addThreadMessage(threadId, sender, content, attMeta.length ? attMeta : null)

    // Broadcast new human message first
    broadcast.broadcast('thread-update', {
      type: 'message',
      threadId,
      messageId: msgId,
      sender,
      content,
      timestamp: new Date().toISOString(),
    })

    res.json({ messageId: msgId, sender, content, timestamp: new Date().toISOString() })

    // Run agent responses async
    agentManager.runThreadAgentResponses(threadId, attachments, (update) => {
      broadcast.broadcast('thread-update', update)
      if (update.type === 'message' && update.approvals?.length) {
        for (const a of update.approvals) broadcast.broadcast('new-approval', a)
      }
      if (update.type === 'message' && update.createThread) {
        // Handled inside agentManager as approval
      }
    })
  } catch (err) {
    console.error('[Threads] message error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// PATCH /threads/:id/pin
router.patch('/:id/pin', requireAuth, async (req, res) => {
  try {
    const { pinned } = req.body
    await db.setThreadPinned(req.params.id, pinned)
    broadcast.broadcast('threads-updated', {})
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PATCH /threads/:id/unarchive — restore an archived thread
router.patch('/:id/unarchive', requireAuth, async (req, res) => {
  try {
    await db.unarchiveThread(req.params.id)
    broadcast.broadcast('threads-updated', {})
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /threads/:id — archive (soft delete, data preserved)
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await db.archiveThread(req.params.id)
    broadcast.broadcast('threads-updated', {})
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
