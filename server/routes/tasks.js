const express = require('express')
const router = express.Router()
const db = require('../db/queries')
const { requireAuth } = require('../middleware/auth')
const broadcast = require('../ws/broadcast')

// GET /tasks
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, owner } = req.query
    const tasks = await db.getTasks(status || null, owner || null)
    res.json(tasks)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /tasks
router.post('/', requireAuth, async (req, res) => {
  try {
    const { title, description, owner, priority, deadline } = req.body
    if (!title) return res.status(400).json({ error: 'title required' })
    const task = await db.createTask(title, description, owner, priority, deadline, 'manual', null)
    broadcast.broadcast('task-update', { type: 'created', task })
    res.json(task)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PATCH /tasks/:id
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const task = await db.updateTask(parseInt(req.params.id), req.body)
    if (!task) return res.status(404).json({ error: 'not found' })
    broadcast.broadcast('task-update', { type: 'updated', task })
    res.json(task)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /tasks/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await db.deleteTask(parseInt(req.params.id))
    broadcast.broadcast('task-update', { type: 'deleted', id: parseInt(req.params.id) })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
