const { Pool } = require('pg')
const { parse } = require('pg-connection-string')

// Parse the URL ourselves so pg-connection-string never sees sslmode.
// Then pass ssl explicitly — this bypasses pg v8's sslmode→verify-full mapping.
const config = parse(process.env.DATABASE_URL || '')

const pool = new Pool({
  host:     config.host,
  port:     config.port     || 5432,
  database: config.database,
  user:     config.user,
  password: config.password,
  ssl:      { rejectUnauthorized: false },
})

module.exports = pool
