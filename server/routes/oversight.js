const express = require('express')
const router = express.Router()
const db = require('../db/queries')
const { requireAuth } = require('../middleware/auth')

// GET /oversight?limit=200&agent=CPO
router.get('/', requireAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 200
    const agent = req.query.agent || null
    const messages = await db.getOversightMessages(limit, agent)
    res.json(messages)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /decisions?q=...&limit=100
router.get('/decisions', requireAuth, async (req, res) => {
  try {
    const query = req.query.q || null
    const limit = parseInt(req.query.limit) || 100
    const decisions = await db.getDecisions(query, limit)
    res.json(decisions)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /decisions/recent
router.get('/decisions/recent', requireAuth, async (req, res) => {
  try {
    const decisions = await db.getRecentDecisions(20)
    res.json(decisions)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
