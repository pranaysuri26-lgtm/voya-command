const { Pool } = require('pg')

// pg-connection-string parses sslmode=require from the URL and maps it to
// verify-full, which enforces cert chain validation. Strip it from the URL
// and set ssl explicitly so rejectUnauthorized:false actually takes effect.
const connectionString = (process.env.DATABASE_URL || '')
  .replace(/([?&])sslmode=[^&]*/g, '$1')
  .replace(/[?&]$/, '')

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
})

module.exports = pool
