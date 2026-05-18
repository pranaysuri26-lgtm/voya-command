require('dotenv').config()
const express = require('express')
const http = require('http')
const cors = require('cors')
const path = require('path')

const { runMigrations } = require('./db/schema')
const broadcast = require('./ws/broadcast')
const scheduler = require('./agents/scheduler')
const agentManager = require('./agents/agentManager')

const authRoutes = require('./routes/auth')
const agentRoutes = require('./routes/agents')
const threadRoutes = require('./routes/threads')
const approvalRoutes = require('./routes/approvals')
const vpRoutes = require('./routes/vp')
const oversightRoutes = require('./routes/oversight')
const taskRoutes = require('./routes/tasks')
const briefingRoutes = require('./routes/briefing')
const backupRoutes = require('./routes/backup')
const reviewRoutes      = require('./routes/review')
const boardBriefRoutes  = require('./routes/boardbrief')

const app = express()
const server = http.createServer(app)

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || '*',
  credentials: true,
}))
app.use(express.json({ limit: '10mb' }))

// ─── Static web app ──────────────────────────────────────────────────────────
// Serve the React SPA from server/public/ (built by `npm run build:web`).
// Must come before API routes so /bundle.js and /index.html are served directly.
app.use(express.static(path.join(__dirname, 'public')))

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }))

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/auth', authRoutes)
app.use('/agents', agentRoutes)
app.use('/threads', threadRoutes)
app.use('/approvals', approvalRoutes)
app.use('/vp', vpRoutes)
app.use('/oversight', oversightRoutes)
app.use('/tasks', taskRoutes)
app.use('/briefing', briefingRoutes)
app.use('/backup', backupRoutes)
app.use('/review', reviewRoutes)
app.use('/boardbrief', boardBriefRoutes)

// Decisions endpoint (used by oversight route and decision log)
const { requireAuth } = require('./middleware/auth')
const db = require('./db/queries')

app.get('/decisions', requireAuth, async (req, res) => {
  try {
    const query = req.query.q || null
    const limit = parseInt(req.query.limit) || 100
    const decisions = await db.getDecisions(query, limit)
    res.json(decisions)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/decisions/log', requireAuth, async (req, res) => {
  try {
    const { agent, title, description, outcome = 'approved', notes = null, decided_by = 'chairman' } = req.body
    if (!agent || !title || !description) {
      return res.status(400).json({ error: 'agent, title, and description are required' })
    }
    const id = await db.logDecision(agent, title, description, outcome, notes, decided_by)
    res.json({ id })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── SPA catch-all ───────────────────────────────────────────────────────────
// Any route not matched by an API handler returns index.html so React Router
// can handle client-side navigation (e.g. a VP bookmarking /threads/42).
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

// ─── Boot ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001

async function boot() {
  try {
    await runMigrations()
    console.log('[Server] DB ready')

    broadcast.init(server)
    scheduler.start()

    // Wire queue high-activity warning → broadcast to all clients
    agentManager.setHighActivityCallback((depth) => {
      broadcast.broadcast('high-activity', {
        message: 'High activity — responses may be delayed',
        depth,
      })
    })

    server.listen(PORT, () => {
      console.log(`[Server] Vondrer Command running on port ${PORT}`)
    })
  } catch (err) {
    console.error('[Server] Boot failed:', err)
    process.exit(1)
  }
}

boot()
