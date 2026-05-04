import { useState } from 'react'

export default function ChairmanAwayModal({ currentAway, vpName, onActivate, onDeactivate, onClose }) {
  const [returnDate, setReturnDate] = useState(currentAway?.returnDate || '')
  const [note, setNote] = useState(currentAway?.note || '')
  const [loading, setLoading] = useState(false)

  // Min date = tomorrow
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const minDate = tomorrow.toISOString().split('T')[0]

  async function handleActivate() {
    if (!returnDate) return
    setLoading(true)
    await onActivate(returnDate, note.trim())
    setLoading(false)
    onClose()
  }

  async function handleDeactivate() {
    setLoading(true)
    await onDeactivate()
    setLoading(false)
    onClose()
  }

  const vp = vpName || 'VP'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 440 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 style={{ margin: 0, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>✈️</span>
            Set Chairman Away
          </h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {currentAway?.active ? (
          // Currently away — show status + return button
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              background: '#78350f22', border: '1px solid #f59e0b44',
              borderRadius: 8, padding: '12px 14px',
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fbbf24', flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#fde68a' }}>CHAIRMAN AWAY MODE ACTIVE</span>
              </div>
              <div style={{ fontSize: 11, color: '#fcd34d' }}>
                {vp} has full authority · Returns {currentAway.returnDate
                  ? new Date(currentAway.returnDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                  : 'unknown'}
              </div>
              {currentAway.note && (
                <div style={{ fontSize: 11, color: '#fde68a', fontStyle: 'italic', marginTop: 2 }}>
                  Handoff: "{currentAway.note}"
                </div>
              )}
            </div>

            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-2)' }}>
              Deactivating away mode will restore Chairman authority immediately. COO will post a board announcement and you'll see a summary of decisions made during your absence.
            </p>
          </div>
        ) : (
          // Not away — show setup form
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>
              When away mode is active, <strong style={{ color: '#94A3B8' }}>{vp} (VP)</strong> gets full Chairman authority — can approve decisions, direct agents, and create threads. COO will announce this to the Board Room.
            </p>

            <div>
              <label style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, display: 'block', marginBottom: 5 }}>
                RETURN DATE *
              </label>
              <input
                type="date"
                value={returnDate}
                min={minDate}
                onChange={e => setReturnDate(e.target.value)}
                style={{
                  width: '100%', background: 'var(--bg-3)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)', padding: '7px 10px',
                  fontSize: 13, color: 'var(--text-1)', outline: 'none',
                  boxSizing: 'border-box', colorScheme: 'dark',
                }}
                onFocus={e => e.target.style.borderColor = '#f59e0b'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, display: 'block', marginBottom: 5 }}>
                HANDOFF NOTE TO {vp.toUpperCase()} <span style={{ fontWeight: 400 }}>(optional)</span>
              </label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder={`e.g. "Focus on getting FORGE to complete the onboarding build. Hold off on major pricing decisions."`}
                rows={3}
                style={{
                  width: '100%', background: 'var(--bg-3)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)', padding: '7px 10px',
                  fontSize: 12, color: 'var(--text-1)', outline: 'none', resize: 'vertical',
                  boxSizing: 'border-box', fontFamily: 'inherit',
                }}
                onFocus={e => e.target.style.borderColor = '#f59e0b'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
            </div>

            <div style={{
              background: 'var(--bg-3)', borderRadius: 8, padding: '10px 12px',
              fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6,
            }}>
              ⚠️ Make sure {vp} has been set up with a PIN before activating. They'll need it to switch into VP mode on this device.
            </div>
          </div>
        )}

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
          {currentAway?.active ? (
            <button
              className="btn btn-approve"
              onClick={handleDeactivate}
              disabled={loading}
            >
              {loading ? 'Processing…' : '↩ Chairman Has Returned'}
            </button>
          ) : (
            <button
              onClick={handleActivate}
              disabled={loading || !returnDate}
              style={{
                background: '#f59e0b', border: '1px solid #f59e0b', borderRadius: 'var(--radius)',
                color: '#000', fontSize: 12, fontWeight: 700, padding: '7px 14px', cursor: 'pointer',
                opacity: !returnDate ? 0.5 : 1,
              }}
            >
              {loading ? 'Activating…' : `✈️ Set Away — Hand off to ${vp}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
