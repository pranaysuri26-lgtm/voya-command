const express = require('express')
const router = express.Router()
const crypto = require('crypto')
const db = require('../db/queries')
const agentManager = require('../agents/agentManager')
const { requireAuth, requireChairman } = require('../middleware/auth')
const broadcast = require('../ws/broadcast')

function hashPin(pin) {
  return crypto.createHash('sha256').update(String(pin)).digest('hex')
}

// GET /vp/profile — public (name + badge only, no pin/notes)
router.get('/profile', requireAuth, async (req, res) => {
  try {
    const row = await db.getVpProfile()
    if (!row) return res.json(null)
    res.json({ name: row.name, badgeColor: row.badge_color, hasPin: !!row.pin_hash })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /vp/profile/full — chairman only (includes private notes)
router.get('/profile/full', requireChairman, async (req, res) => {
  try {
    const row = await db.getVpProfileWithNotes()
    if (!row) return res.json(null)
    res.json({ name: row.name, badgeColor: row.badge_color, hasPin: !!row.pin_hash, privateNotes: row.private_notes })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /vp/profile — chairman sets up VP profile
router.post('/profile', requireChairman, async (req, res) => {
  try {
    const { name, pin, badgeColor = '#94A3B8', privateNotes } = req.body
    if (!name) return res.status(400).json({ error: 'name required' })
    const pinHash = pin ? hashPin(pin) : null
    await db.upsertVpProfile(name, badgeColor, privateNotes, pinHash)
    res.json({ name, badgeColor, hasPin: !!pinHash })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /vp/verify-pin — VP enters PIN to activate VP mode
router.post('/verify-pin', requireAuth, async (req, res) => {
  try {
    const { pin } = req.body
    const row = await db.getVpProfileWithNotes()
    if (!row?.pin_hash) return res.status(400).json({ error: 'No PIN set' })
    const match = hashPin(pin) === row.pin_hash
    res.json({ valid: match })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /vp/away
router.get('/away', requireAuth, async (req, res) => {
  try {
    const away = await db.getChairmanAway()
    res.json(away)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /vp/away — chairman activates away mode
router.post('/away', requireChairman, async (req, res) => {
  try {
    const { returnDate, note } = req.body
    await db.setChairmanAway(returnDate, note)
    const away = await db.getChairmanAway()
    broadcast.broadcast('chairman-away-changed', away)

    // COO posts board announcement async
    agentManager.postAwayAnnouncement(returnDate, note, false)
      .then(() => broadcast.broadcast('threads-updated', {}))
      .catch(err => console.error('[Away] announcement error:', err.message))

    res.json(away)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /vp/away — chairman returns
router.delete('/away', requireChairman, async (req, res) => {
  try {
    const prevAway = await db.getChairmanAway()
    const since = prevAway?.since
    await db.clearChairmanAway()
    broadcast.broadcast('chairman-away-changed', null)

    // Build return summary
    const summary = await agentManager.buildReturnSummary(since)

    // COO posts return announcement async
    agentManager.postAwayAnnouncement(null, null, true)
      .then(() => broadcast.broadcast('threads-updated', {}))
      .catch(err => console.error('[Return] announcement error:', err.message))

    res.json({ summary })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
