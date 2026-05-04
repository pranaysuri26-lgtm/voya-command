require('dotenv').config()
const express = require('express')
const http = require('http')
const cors = require('cors')

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

const app = express()
const server = http.createServer(app)

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || '*',
  credentials: true,
}))
app.use(express.json({ limit: '10mb' }))

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }))

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/auth', authRoutes)
app.use('/agents', agentRoutes)
app.use('/threads', threadRoutes)
app.use('/approvals', approvalRoutes)
app.use('/vp', vpRoutes)
app.use('/oversight', oversightRoutes)

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
      console.log(`[Server] Voya Command running on port ${PORT}`)
    })
  } catch (err) {
    console.error('[Server] Boot failed:', err)
    process.exit(1)
  }
}

boot()
