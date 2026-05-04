const express = require('express')
const bcrypt = require('bcryptjs')
const router = express.Router()
const db = require('../db/queries')
const { signToken, requireAuth } = require('../middleware/auth')

// POST /auth/register — first-time setup (chairman) or VP invite
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, inviteCode } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' })

    const existing = await db.getUserByEmail(email)
    if (existing) return res.status(409).json({ error: 'Email already registered' })

    const userCount = await db.countUsers()
    let role = 'chairman'

    if (userCount > 0) {
      // Not first user — must have valid invite code
      if (!inviteCode) return res.status(400).json({ error: 'Invite code required' })
      const invite = await db.getInviteCode(inviteCode)
      if (!invite) return res.status(400).json({ error: 'Invalid or expired invite code' })
      role = invite.role
      await db.markInviteUsed(inviteCode)
    }

    const hash = await bcrypt.hash(password, 10)
    const user = await db.createUser(email, hash, role, name)
    const token = signToken({ id: user.id, email: user.email, role: user.role, name: user.name })

    // First launch
    const firstLaunchDone = await db.getFirstLaunchDone()
    res.json({ token, user: { id: user.id, email: user.email, role: user.role, name: user.name }, firstLaunch: !firstLaunchDone })
  } catch (err) {
    console.error('[Auth] Register error:', err.message)
    res.status(500).json({ error: 'Registration failed' })
  }
})

// POST /auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' })

    const user = await db.getUserByEmail(email)
    if (!user) return res.status(401).json({ error: 'Invalid email or password' })

    const match = await bcrypt.compare(password, user.password_hash)
    if (!match) return res.status(401).json({ error: 'Invalid email or password' })

    const token = signToken({ id: user.id, email: user.email, role: user.role, name: user.name })
    res.json({ token, user: { id: user.id, email: user.email, role: user.role, name: user.name } })
  } catch (err) {
    console.error('[Auth] Login error:', err.message)
    res.status(500).json({ error: 'Login failed' })
  }
})

// GET /auth/me — validate token + return user
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user })
})

// POST /auth/invite — chairman creates invite code for VP
router.post('/invite', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'chairman') return res.status(403).json({ error: 'Chairman only' })
    const crypto = require('crypto')
    const code = crypto.randomBytes(6).toString('hex').toUpperCase()
    const invite = await db.createInviteCode(code, 'vp', req.user.id)
    res.json({ code: invite.code, expiresAt: invite.expires_at })
  } catch (err) {
    console.error('[Auth] Invite error:', err.message)
    res.status(500).json({ error: 'Failed to create invite' })
  }
})

// GET /auth/first-launch
router.get('/first-launch', requireAuth, async (req, res) => {
  try {
    const done = await db.getFirstLaunchDone()
    res.json({ firstLaunch: !done })
  } catch (err) {
    res.status(500).json({ error: 'Failed' })
  }
})

// POST /auth/first-launch-done
router.post('/first-launch-done', requireAuth, async (req, res) => {
  try {
    await db.setFirstLaunchDone()
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed' })
  }
})

module.exports = router
