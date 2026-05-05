'use strict'
const express        = require('express')
const router         = express.Router()
const { requireAuth } = require('../middleware/auth')

// Only available when R2 is configured
function r2Ready() {
  return !!(process.env.R2_ACCOUNT_ID && process.env.R2_BUCKET && process.env.R2_ACCESS_KEY_ID)
}

// POST /backup/trigger — run a backup right now
router.post('/trigger', requireAuth, async (req, res) => {
  if (!r2Ready()) return res.status(503).json({ error: 'R2 credentials not configured' })
  try {
    const { runBackup } = require('../backup/r2-backup')
    const key = await runBackup()
    res.json({ ok: true, key })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /backup/restore-test — verify latest backup is restorable
router.post('/restore-test', requireAuth, async (req, res) => {
  if (!r2Ready()) return res.status(503).json({ error: 'R2 credentials not configured' })
  try {
    const { runRestoreTest } = require('../backup/r2-backup')
    const result = await runRestoreTest(req.body.key || null)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /backup/status — list recent backups
router.get('/status', requireAuth, async (req, res) => {
  if (!r2Ready()) return res.json({ configured: false })
  try {
    const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3')
    const r2 = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId:     process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    })
    const { Contents = [] } = await r2.send(new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET, Prefix: 'backups/',
    }))
    Contents.sort((a, b) => b.LastModified - a.LastModified)
    res.json({
      configured: true,
      bucket: process.env.R2_BUCKET,
      backups: Contents.slice(0, 10).map(o => ({
        key:          o.Key,
        size:         o.Size,
        lastModified: o.LastModified,
      })),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
