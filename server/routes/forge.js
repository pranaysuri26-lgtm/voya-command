const express = require('express')
const router = express.Router()
const db = require('../db/queries')
const { requireAuth } = require('../middleware/auth')

// GET /forge/builds — all recent builds
router.get('/builds', requireAuth, async (req, res) => {
  try {
    const builds = await db.getForgeBuilds(50)
    // Group by session
    const sessions = {}
    for (const b of builds) {
      if (!sessions[b.session_id]) {
        sessions[b.session_id] = {
          session_id: b.session_id,
          task_description: b.task_description,
          created_at: b.created_at,
          files: [],
        }
      }
      sessions[b.session_id].files.push(b)
    }
    res.json(Object.values(sessions))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /forge/builds/:sessionId — files in one session
router.get('/builds/:sessionId', requireAuth, async (req, res) => {
  try {
    const files = await db.getForgeBuildsBySession(req.params.sessionId)
    res.json(files)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /forge/preview/:id — serve HTML build for preview (no auth — public preview URL)
router.get('/preview/:id', async (req, res) => {
  try {
    const build = await db.getForgeBuild(req.params.id)
    if (!build) return res.status(404).send('<h1>Build not found</h1>')
    if (build.language === 'html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.send(build.content)
    } else {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.send(build.content)
    }
  } catch (err) {
    res.status(500).send(`<h1>Error: ${err.message}</h1>`)
  }
})

// PATCH /forge/builds/:id/status
router.patch('/builds/:id/status', requireAuth, async (req, res) => {
  try {
    const { status } = req.body
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' })
    }
    await db.updateForgeBuildStatus(req.params.id, status)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
