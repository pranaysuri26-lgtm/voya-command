const pool = require('./pool')

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'vp',
    name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS messages (
    id BIGSERIAL PRIMARY KEY,
    agent TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    source TEXT DEFAULT 'manual',
    timestamp TIMESTAMPTZ DEFAULT NOW()
  );

  -- User-scoped conversations (added after initial launch)
  ALTER TABLE messages ADD COLUMN IF NOT EXISTS user_id BIGINT;

  CREATE TABLE IF NOT EXISTS approvals (
    id BIGSERIAL PRIMARY KEY,
    agent TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    type TEXT DEFAULT 'decision',
    metadata TEXT,
    proposed_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS decisions (
    id BIGSERIAL PRIMARY KEY,
    agent TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    outcome TEXT NOT NULL,
    decided_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT,
    decided_by TEXT DEFAULT 'chairman'
  );

  CREATE TABLE IF NOT EXISTS discussions (
    id BIGSERIAL PRIMARY KEY,
    topic TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    participants TEXT DEFAULT '[]',
    recommendation TEXT,
    trigger_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS discussion_messages (
    id BIGSERIAL PRIMARY KEY,
    discussion_id BIGINT NOT NULL REFERENCES discussions(id),
    agent TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS threads (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    pinned INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS thread_members (
    thread_id BIGINT NOT NULL REFERENCES threads(id),
    agent TEXT NOT NULL,
    PRIMARY KEY (thread_id, agent)
  );

  CREATE TABLE IF NOT EXISTS thread_messages (
    id BIGSERIAL PRIMARY KEY,
    thread_id BIGINT NOT NULL REFERENCES threads(id),
    sender TEXT NOT NULL,
    content TEXT NOT NULL,
    attachments TEXT DEFAULT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    owner TEXT NOT NULL DEFAULT 'team',
    status TEXT DEFAULT 'todo',
    priority TEXT DEFAULT 'medium',
    deadline DATE,
    source_type TEXT DEFAULT 'manual',
    source_id BIGINT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS agent_memories (
    agent TEXT PRIMARY KEY,
    summary TEXT DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS vp_profile (
    id INTEGER PRIMARY KEY DEFAULT 1,
    name TEXT DEFAULT 'VP',
    badge_color TEXT DEFAULT '#94A3B8',
    private_notes TEXT,
    pin_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
`

async function runMigrations() {
  const client = await pool.connect()
  try {
    await client.query(SCHEMA)

    // Seed default threads if none exist
    const { rows } = await client.query('SELECT COUNT(*) as count FROM threads')
    if (parseInt(rows[0].count) === 0) {
      const seeds = [
        { name: 'Board Room', members: ['CPO','CMO','CTO','CFO','COO','FORGE'], pinned: 1 },
        { name: 'Engineering',  members: ['CTO','FORGE'], pinned: 1 },
        { name: 'Growth',       members: ['CMO','CPO'],   pinned: 0 },
        { name: 'Finance Review', members: ['CFO','COO'], pinned: 0 },
      ]
      for (const seed of seeds) {
        const res = await client.query(
          'INSERT INTO threads (name, pinned) VALUES ($1, $2) RETURNING id',
          [seed.name, seed.pinned]
        )
        const threadId = res.rows[0].id
        for (const agent of seed.members) {
          await client.query(
            'INSERT INTO thread_members (thread_id, agent) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [threadId, agent]
          )
        }
      }
      console.log('[DB] Seeded default threads')
    }

    console.log('[DB] Migrations complete')
  } finally {
    client.release()
  }
}

module.exports = { runMigrations }
