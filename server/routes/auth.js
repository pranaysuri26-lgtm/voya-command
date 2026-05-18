const express = require('express')
const bcrypt = require('bcryptjs')
const router = express.Router()
const db = require('../db/queries')
const { signToken, requireAuth } = require('../middleware/auth')

// POST /auth/register
// Slot 1 → Chairman, Slot 2 → VP, Slot 3+ → blocked.
// No invite codes. No complexity.
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' })

    const userCount = await db.countUsers()
    if (userCount >= 2) return res.status(403).json({ error: 'Registration closed' })

    const existing = await db.getUserByEmail(email)
    if (existing) return res.status(409).json({ error: 'Email already registered' })

    const role = userCount === 0 ? 'chairman' : 'vp'
    const hash = await bcrypt.hash(password, 10)
    const user = await db.createUser(email, hash, role, name)
    const token = signToken({ id: user.id, email: user.email, role: user.role, name: user.name })

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

// POST /auth/reset-all — TEMPORARY: lists all users and resets a password
// Protected by a one-time secret passed as query param
// REMOVE THIS ROUTE after use
router.post('/reset-all', async (req, res) => {
  const { secret, email, newPassword } = req.body
  if (secret !== 'vondrer-reset-2026') return res.status(403).json({ error: 'Wrong secret' })
  try {
    const pool = require('../db/pool')
    if (!email) {
      // Just list users
      const { rows } = await pool.query('SELECT id, email, role, name, created_at FROM users ORDER BY created_at')
      return res.json({ users: rows })
    }
    // Reset password
    const hash = await bcrypt.hash(newPassword, 10)
    await pool.query('UPDATE users SET password_hash=$1 WHERE email=$2', [hash, email])
    res.json({ ok: true, message: `Password reset for ${email}` })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
