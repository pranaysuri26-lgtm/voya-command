const { Pool } = require('pg')

// pg v8+ parses sslmode from the connection string and treats 'require' as
// 'verify-full', overriding pool-level ssl options. Set this before the Pool
// is created so Node's TLS stack skips certificate chain verification.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

module.exports = pool
