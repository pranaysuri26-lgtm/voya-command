const express = require('express')
const router = express.Router()
const db = require('../db/queries')
const { requireAuth } = require('../middleware/auth')

// GET /briefing/daily — aggregated morning brief data
router.get('/daily', requireAuth, async (req, res) => {
  try {
    const AGENTS = ['COO', 'CPO', 'CMO', 'CTO', 'CFO', 'FORGE']

    const [pendingApprovals, recentDecisions, overdueTasks, allTasks] = await Promise.all([
      db.getApprovals('inbox'),
      db.getDecisions(null, 20),
      db.getOverdueTasks(),
      db.getTasks(),
    ])

    // Last autonomous message per agent (their "headline")
    const agentHeadlines = {}
    for (const agent of AGENTS) {
      const pool = require('../db/pool')
      const { rows } = await pool.query(
        `SELECT content, timestamp FROM messages
         WHERE agent=$1 AND role='agent' AND source IN ('autonomous','manual')
         ORDER BY timestamp DESC LIMIT 1`,
        [agent]
      )
      if (rows[0]) {
        // Trim to first 2 sentences for the brief
        const sentences = rows[0].content
          .replace(/\[.*?\]/g, '')
          .split(/(?<=[.!?])\s+/)
          .filter(s => s.trim().length > 0)
          .slice(0, 2)
          .join(' ')
          .trim()
        agentHeadlines[agent] = { content: sentences, timestamp: rows[0].timestamp }
      }
    }

    // Tasks by status
    const tasksByStatus = {
      todo:        allTasks.filter(t => t.status === 'todo'),
      in_progress: allTasks.filter(t => t.status === 'in_progress'),
      done:        allTasks.filter(t => t.status === 'done'),
    }

    // Decisions in last 24h
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const recentDecisions24h = recentDecisions.filter(d => new Date(d.decided_at) > yesterday)

    res.json({
      generatedAt: new Date().toISOString(),
      pendingApprovals,
      overdueTasks,
      tasksByStatus,
      agentHeadlines,
      recentDecisions: recentDecisions24h,
      allRecentDecisions: recentDecisions.slice(0, 8),
      stats: {
        pendingCount:    pendingApprovals.length,
        overdueCount:    overdueTasks.length,
        todoCount:       tasksByStatus.todo.length,
        inProgressCount: tasksByStatus.in_progress.length,
        doneCount:       tasksByStatus.done.length,
        decisionsToday:  recentDecisions24h.length,
      },
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
