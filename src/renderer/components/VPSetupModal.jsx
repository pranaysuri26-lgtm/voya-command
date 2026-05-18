import { useState, useEffect } from 'react'

export default function VPSetupModal({ existing, onClose, onSaved }) {
  const [name, setName] = useState(existing?.name || 'VP')
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Load private notes (Chairman only view)
  useEffect(() => {
    window.vondrerAPI.getVpProfileWithNotes().then(p => {
      if (p) {
        setName(p.name || 'VP')
        setNotes(p.privateNotes || '')
      }
    })
  }, [])

  async function handleSave() {
    setError('')
    if (!name.trim()) { setError('VP name is required'); return }

    const isNewPin = pin.trim().length > 0

    if (isNewPin || !existing?.hasPin) {
      if (!/^\d{4}$/.test(pin)) { setError('PIN must be exactly 4 digits'); return }
      if (pin !== pinConfirm) { setError('PINs do not match'); return }
    }

    setLoading(true)
    try {
      if (isNewPin || !existing?.hasPin) {
        const result = await window.vondrerAPI.setupVpProfile(name.trim(), pin)
        if (result?.error) { setError(result.error); setLoading(false); return }
      } else {
        await window.vondrerAPI.updateVpName(name.trim())
      }
      await window.vondrerAPI.updateVpNotes(notes)
      onSaved?.({ name: name.trim(), hasPin: true })
      onClose()
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 420 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 style={{ margin: 0, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              background: '#94A3B822', border: '1px solid #94A3B844',
              color: '#94A3B8', fontSize: 10, fontWeight: 700,
              padding: '2px 8px', borderRadius: 6, letterSpacing: 0.5,
            }}>VP</span>
            VP Profile Setup
          </h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          <div>
            <label style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, display: 'block', marginBottom: 5 }}>
              VP NAME
            </label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Sarah, VP Operations"
              style={{
                width: '100%', background: 'var(--bg-3)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: '7px 10px',
                fontSize: 13, color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box',
              }}
              onFocus={e => e.target.style.borderColor = '#94A3B8'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, display: 'block', marginBottom: 5 }}>
              {existing?.hasPin ? 'NEW PIN (leave blank to keep current)' : 'SET 4-DIGIT PIN'}
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
                style={{
                  width: 90, background: 'var(--bg-3)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)', padding: '7px 10px',
                  fontSize: 18, color: 'var(--text-1)', outline: 'none',
                  letterSpacing: 6, textAlign: 'center',
                }}
                onFocus={e => e.target.style.borderColor = '#94A3B8'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pinConfirm}
                onChange={e => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="confirm"
                style={{
                  width: 90, background: 'var(--bg-3)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)', padding: '7px 10px',
                  fontSize: 18, color: 'var(--text-1)', outline: 'none',
                  letterSpacing: 6, textAlign: 'center',
                }}
                onFocus={e => e.target.style.borderColor = '#94A3B8'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
              PRIVATE NOTES <span style={{ color: 'var(--text-3)', fontWeight: 400, fontSize: 10 }}>(Chairman only — not visible to VP or agents)</span>
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Performance observations, delegation notes, trust level…"
              rows={3}
              style={{
                width: '100%', background: 'var(--bg-3)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: '7px 10px',
                fontSize: 12, color: 'var(--text-1)', outline: 'none', resize: 'vertical',
                boxSizing: 'border-box', fontFamily: 'inherit',
              }}
              onFocus={e => e.target.style.borderColor = '#94A3B8'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3, fontStyle: 'italic' }}>
              Title shown to VP: "VP" — subtitle visible to Chairman only: "Subject to change based on performance"
            </div>
          </div>

          {error && (
            <div style={{ fontSize: 11, color: 'var(--danger)', background: 'var(--danger-dim)', borderRadius: 6, padding: '6px 10px' }}>
              {error}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={loading}
            style={{ background: '#94A3B8', borderColor: '#94A3B8', color: '#000' }}
          >
            {loading ? 'Saving…' : existing?.hasPin ? 'Update VP Profile' : 'Create VP Profile'}
          </button>
        </div>
      </div>
    </div>
  )
}
