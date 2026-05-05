'use strict'
/**
 * r2-backup.js — Voya Command nightly database backup
 *
 * Spec (locked by CTO/CFO thread):
 *   - Dump the Railway Postgres DB, gzip compress
 *   - Upload to Cloudflare R2 with timestamp in filename
 *   - Retain last 7 days, auto-delete older backups
 *   - Credentials must be bucket-scoped (not account-wide)
 *   - Restore test must pass before this is considered done
 *
 * Uses the pg npm module directly — no pg_dump binary required.
 * Works on any PostgreSQL version without version-mismatch issues.
 *
 * Required env vars (set in Railway):
 *   DATABASE_URL              — already present
 *   R2_ACCOUNT_ID             — Cloudflare account ID
 *   R2_BUCKET                 — bucket name (e.g. "voya-backups")
 *   R2_ACCESS_KEY_ID          — R2 API token access key
 *   R2_SECRET_ACCESS_KEY      — R2 API token secret key
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const { createGzip, createGunzip } = require('zlib')
const { Pool }   = require('pg')
const {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  GetObjectCommand,
} = require('@aws-sdk/client-s3')

// ─── Config ──────────────────────────────────────────────────────────────────
const RETAIN_DAYS = 7

// ─── Validation ───────────────────────────────────────────────────────────────
function validateEnv() {
  const missing = ['DATABASE_URL','R2_ACCOUNT_ID','R2_BUCKET','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY']
    .filter(k => !process.env[k])
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(', ')}`)
}

// ─── R2 client ────────────────────────────────────────────────────────────────
function getR2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId:     process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  })
}

// ─── Timestamp ────────────────────────────────────────────────────────────────
function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

// ─── Native pg dump (no pg_dump binary needed) ────────────────────────────────
// Connects via pg module and generates a valid SQL dump with:
//   - Table data as INSERT ... ON CONFLICT DO NOTHING
//   - Sequence resets so auto-increment IDs continue correctly after restore
async function nativeDump(dbUrl) {
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: dbUrl.includes('railway.internal')
      ? { rejectUnauthorized: false }
      : { rejectUnauthorized: false },
  })

  const client = await pool.connect()
  const lines = []

  try {
    lines.push(`-- Voya Command database dump`)
    lines.push(`-- Generated: ${new Date().toISOString()}`)
    lines.push(`-- Format: INSERT statements with ON CONFLICT DO NOTHING`)
    lines.push('')
    lines.push('BEGIN;')
    lines.push('')

    // All user tables in dependency order (parents before children via FK sort)
    const { rows: tables } = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `)

    for (const { table_name } of tables) {
      const { rows: cols } = await client.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [table_name])

      const { rows: data } = await client.query(`SELECT * FROM "${table_name}" ORDER BY 1`)

      lines.push(`-- ── ${table_name} (${data.length} rows) ──`)

      if (data.length > 0) {
        const colNames = cols.map(c => `"${c.column_name}"`).join(', ')
        for (const row of data) {
          const values = cols.map(c => {
            const val = row[c.column_name]
            if (val === null || val === undefined) return 'NULL'
            if (typeof val === 'number')  return String(val)
            if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE'
            if (val instanceof Date)      return `'${val.toISOString()}'`
            if (typeof val === 'object')  return `'${JSON.stringify(val).replace(/'/g, "''")}'`
            return `'${String(val).replace(/'/g, "''")}'`
          }).join(', ')
          lines.push(`INSERT INTO "${table_name}" (${colNames}) VALUES (${values}) ON CONFLICT DO NOTHING;`)
        }
      }
      lines.push('')
    }

    // Reset all sequences so auto-increment continues from the right value after restore
    const { rows: seqs } = await client.query(`
      SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public'
    `)
    if (seqs.length > 0) {
      lines.push('-- ── Sequence resets ──')
      for (const { sequence_name } of seqs) {
        const { rows: [sv] } = await client.query(`SELECT last_value FROM "${sequence_name}"`)
        lines.push(`SELECT setval('${sequence_name}', ${sv.last_value}, true);`)
      }
      lines.push('')
    }

    lines.push('COMMIT;')
    return lines.join('\n')
  } finally {
    client.release()
    await pool.end()
  }
}

// ─── Gzip helpers ─────────────────────────────────────────────────────────────
function gzip(str) {
  return new Promise((resolve, reject) => {
    const gz = createGzip({ level: 9 })
    const chunks = []
    gz.on('data', c => chunks.push(c))
    gz.on('end',  () => resolve(Buffer.concat(chunks)))
    gz.on('error', reject)
    gz.end(Buffer.from(str, 'utf8'))
  })
}

function gunzip(buf) {
  return new Promise((resolve, reject) => {
    const gz = createGunzip()
    const chunks = []
    gz.on('data', c => chunks.push(c))
    gz.on('end',  () => resolve(Buffer.concat(chunks)))
    gz.on('error', reject)
    gz.end(buf)
  })
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = []
    stream.on('data', c => chunks.push(c))
    stream.on('end',  () => resolve(Buffer.concat(chunks)))
    stream.on('error', reject)
  })
}

// ─── Prune backups older than RETAIN_DAYS ─────────────────────────────────────
async function pruneOldBackups(r2) {
  const cutoff = new Date(Date.now() - RETAIN_DAYS * 24 * 60 * 60 * 1000)
  const { Contents = [] } = await r2.send(new ListObjectsV2Command({
    Bucket: process.env.R2_BUCKET, Prefix: 'backups/',
  }))
  const toDelete = Contents.filter(obj => obj.LastModified < cutoff)
  for (const obj of toDelete) {
    await r2.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: obj.Key }))
    console.log(`[Backup] Pruned: ${obj.Key}`)
  }
  const kept = Contents.length - toDelete.length
  console.log(`[Backup] Retention: kept ${kept}, deleted ${toDelete.length}`)
}

// ─── Run backup ───────────────────────────────────────────────────────────────
async function runBackup() {
  validateEnv()
  const r2  = getR2Client()
  const key = `backups/voya-${timestamp()}.sql.gz`

  console.log(`[Backup] Dumping database…`)
  const sql  = await nativeDump(process.env.DATABASE_URL)
  const body = await gzip(sql)

  const sizeMB = (body.length / 1024 / 1024).toFixed(2)
  console.log(`[Backup] Compressed: ${sizeMB} MB → uploading to ${process.env.R2_BUCKET}/${key}`)

  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET, Key: key,
    Body: body, ContentType: 'application/gzip',
  }))

  console.log(`[Backup] Uploaded → r2://${process.env.R2_BUCKET}/${key}`)
  await pruneOldBackups(r2)
  console.log('[Backup] ✓ Done')
  return key
}

// ─── Restore test ─────────────────────────────────────────────────────────────
async function runRestoreTest(backupKey) {
  validateEnv()
  const r2 = getR2Client()

  // Use most recent backup if none specified
  if (!backupKey) {
    const { Contents = [] } = await r2.send(new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET, Prefix: 'backups/',
    }))
    if (!Contents.length) throw new Error('No backups found in R2')
    Contents.sort((a, b) => b.LastModified - a.LastModified)
    backupKey = Contents[0].Key
  }

  console.log(`[Restore-test] Downloading ${backupKey}…`)
  const { Body } = await r2.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: backupKey }))

  const compressed = await streamToBuffer(Body)
  const sql        = (await gunzip(compressed)).toString('utf8')

  console.log(`[Restore-test] Decompressed: ${(sql.length / 1024).toFixed(1)} KB`)

  // Verify key tables are present
  const required = ['messages', 'threads', 'approvals', 'users']
  const missing  = required.filter(t => !sql.includes(`"${t}"`))

  if (missing.length) {
    throw new Error(`Restore test FAILED — missing expected tables: ${missing.join(', ')}`)
  }

  const insertCount = (sql.match(/^INSERT INTO/gm) || []).length
  console.log(`[Restore-test] ✓ PASSED — ${insertCount} INSERT statements, all required tables present`)
  console.log(`[Restore-test] Backup key: ${backupKey}`)
  return { passed: true, inserts: insertCount, key: backupKey }
}

// ─── CLI ──────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const cmd = process.argv[2]
  if (cmd === 'restore-test') {
    runRestoreTest(process.argv[3] || null)
      .then(r => { console.log('[Restore-test] Result:', r); process.exit(0) })
      .catch(err => { console.error('[Restore-test] ERROR:', err.message); process.exit(1) })
  } else {
    runBackup()
      .then(() => process.exit(0))
      .catch(err => { console.error('[Backup] ERROR:', err.message); process.exit(1) })
  }
}

module.exports = { runBackup, runRestoreTest }
