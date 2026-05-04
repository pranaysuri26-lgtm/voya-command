const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET || 'voya-command-secret-change-in-prod'

function requireAuth(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing auth token' })
  }
  const token = header.slice(7)
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.user = payload // { id, email, role, name }
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

function requireChairman(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'chairman') {
      return res.status(403).json({ error: 'Chairman only' })
    }
    next()
  })
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' })
}

module.exports = { requireAuth, requireChairman, signToken }
