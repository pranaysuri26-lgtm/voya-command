import { useState, useRef, useEffect } from 'react'

export default function VPModeGate({ vpName, onSuccess, onCancel }) {
  const [digits, setDigits] = useState(['', '', '', ''])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const refs = [useRef(), useRef(), useRef(), useRef()]

  useEffect(() => {
    refs[0].current?.focus()
  }, [])

  function handleDigit(i, val) {
    const d = val.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[i] = d
    setDigits(next)
    setError('')
    if (d && i < 3) refs[i + 1].current?.focus()
    if (next.every(x => x !== '') && i === 3) verify(next.join(''))
  }

  function handleKeyDown(i, e) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      refs[i - 1].current?.focus()
      const next = [...digits]
      next[i - 1] = ''
      setDigits(next)
    }
    if (e.key === 'Escape') onCancel()
  }

  async function verify(pin) {
    setLoading(true)
    try {
      const result = await window.vondrerAPI.verifyVpPin(pin)
      if (result.valid) {
        onSuccess()
      } else {
        setError('Incorrect PIN')
        setDigits(['', '', '', ''])
        setTimeout(() => refs[0].current?.focus(), 50)
      }
    } catch (err) {
      setError('Verification failed')
    }
    setLoading(false)
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal"
        style={{ maxWidth: 320, textAlign: 'center' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '28px 24px 20px' }}>
          {/* VP badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 52, height: 52, borderRadius: 14,
            background: '#94A3B822', border: '2px solid #94A3B844',
            marginBottom: 14,
          }}>
            <span style={{ fontSize: 22, color: '#94A3B8', fontWeight: 800 }}>VP</span>
          </div>

          <h3 style={{ margin: '0 0 4px', fontSize: 15, color: 'var(--text-1)' }}>
            Switch to {vpName || 'VP'} Mode
          </h3>
          <p style={{ margin: '0 0 20px', fontSize: 12, color: 'var(--text-3)' }}>
            Enter your 4-digit PIN to continue
          </p>

          {/* PIN digit inputs */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 14 }}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={refs[i]}
                type="password"
                inputMode="numeric"
                maxLength={1}
                value={d}
                onChange={e => handleDigit(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
                disabled={loading}
                style={{
                  width: 52, height: 56, borderRadius: 10,
                  background: d ? '#94A3B822' : 'var(--bg-3)',
                  border: `2px solid ${d ? '#94A3B8' : error ? 'var(--danger)' : 'var(--border)'}`,
                  fontSize: 24, color: 'var(--text-1)', textAlign: 'center',
                  outline: 'none', fontWeight: 700,
                  transition: 'border-color 0.15s',
                }}
              />
            ))}
          </div>

          {error && (
            <div style={{
              fontSize: 11, color: 'var(--danger)',
              background: 'var(--danger-dim)', borderRadius: 6,
              padding: '5px 12px', marginBottom: 12,
              display: 'inline-block',
            }}>
              {error}
            </div>
          )}

          {loading && (
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8 }}>Verifying…</div>
          )}

          <div style={{ marginTop: 8 }}>
            <button
              className="btn btn-secondary"
              onClick={onCancel}
              style={{ fontSize: 12, width: '100%' }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
