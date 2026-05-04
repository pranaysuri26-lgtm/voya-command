import { useState } from 'react'

export default function LoginScreen({ onAuth }) {
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      let result
      if (mode === 'login') {
        result = await window.voyaAPI.login(email, password)
      } else {
        result = await window.voyaAPI.register(email, password, name || undefined, inviteCode || undefined)
      }
      onAuth(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-1)', flexDirection: 'column', gap: 32,
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-2px', marginBottom: 6 }}>V</div>
        <div style={{ fontSize: 14, color: 'var(--text-2)', fontWeight: 500 }}>Voya Command</div>
      </div>

      <div style={{
        background: 'var(--bg-2)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '28px 32px', width: 360,
      }}>
        <div style={{ marginBottom: 20, display: 'flex', gap: 8 }}>
          <button
            className={`btn ${mode === 'login' ? 'btn-primary' : ''}`}
            style={{ flex: 1, fontSize: 13 }}
            onClick={() => { setMode('login'); setError(null) }}
          >
            Sign In
          </button>
          <button
            className={`btn ${mode === 'register' ? 'btn-primary' : ''}`}
            style={{ flex: 1, fontSize: 13 }}
            onClick={() => { setMode('register'); setError(null) }}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mode === 'register' && (
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>Name (optional)</label>
              <input
                className="msg-input"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your name"
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>
          )}

          <div>
            <label style={{ fontSize: 11, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>Email</label>
            <input
              className="msg-input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>Password</label>
            <input
              className="msg-input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              required
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>

          {mode === 'register' && (
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>
                Invite Code <span style={{ color: 'var(--text-3)', fontSize: 10 }}>(required for VP)</span>
              </label>
              <input
                className="msg-input"
                type="text"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value.toUpperCase())}
                placeholder="XXXXXX"
                style={{ width: '100%', boxSizing: 'border-box', letterSpacing: 2 }}
              />
            </div>
          )}

          {error && (
            <div style={{
              background: '#dc262622', border: '1px solid #dc262644',
              borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#f87171',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ marginTop: 4, fontSize: 14, padding: '10px 0' }}
            disabled={loading}
          >
            {loading ? '…' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
        Connecting to{' '}
        <span style={{ color: 'var(--text-2)', fontFamily: 'monospace' }}>
          {(typeof process !== 'undefined' && process.env?.VOYA_SERVER_URL) || 'localhost:3001'}
        </span>
      </div>
    </div>
  )
}
