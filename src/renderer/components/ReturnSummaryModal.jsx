const AGENT_COLORS = {
  CPO: '#818cf8', CMO: '#f472b6', CTO: '#22d3ee',
  CFO: '#34d399', COO: '#fbbf24', FORGE: '#00BCD4',
}

function outcomeColor(outcome) {
  if (outcome === 'approved') return 'var(--success)'
  if (outcome === 'rejected') return 'var(--danger)'
  return 'var(--text-3)'
}

export default function ReturnSummaryModal({ summary, vpName, onClose }) {
  const { decisionCount = 0, decisions = [], threadCount = 0, threads = [], since } = summary || {}
  const vp = vpName || 'VP'

  const sinceStr = since
    ? new Date(since).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'your absence'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 500, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>👋 Welcome back, Chairman</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Summary stats */}
          <div style={{
            background: 'var(--bg-3)', borderRadius: 8, padding: '12px 14px',
            display: 'flex', gap: 20,
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)' }}>{decisionCount}</div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>decisions by {vp}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)' }}>{threadCount}</div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>threads created</div>
            </div>
            <div style={{ flex: 1, fontSize: 11, color: 'var(--text-3)', alignSelf: 'center', textAlign: 'right' }}>
              Since {sinceStr}
            </div>
          </div>

          {/* Decisions list */}
          {decisions.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: 0.5, marginBottom: 8 }}>
                DECISIONS MADE BY {vp.toUpperCase()} <span style={{
                  background: '#f59e0b22', color: '#fbbf24',
                  fontSize: 9, padding: '1px 6px', borderRadius: 4, marginLeft: 4,
                }}>VP ACTING · Chairman Away</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {decisions.map((d, i) => (
                  <div key={i} style={{
                    background: 'var(--bg-3)', borderRadius: 6, padding: '8px 10px',
                    borderLeft: `3px solid ${AGENT_COLORS[d.agent] || 'var(--text-3)'}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: AGENT_COLORS[d.agent] || 'var(--text-2)' }}>
                        {d.agent}
                      </span>
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                        background: `${outcomeColor(d.outcome)}22`, color: outcomeColor(d.outcome),
                        textTransform: 'uppercase',
                      }}>
                        {d.outcome}
                      </span>
                      <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-3)' }}>
                        {new Date(d.decided_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-1)', fontWeight: 600 }}>{d.title}</div>
                    {d.description && (
                      <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{d.description}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* New threads */}
          {threads.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: 0.5, marginBottom: 6 }}>
                THREADS CREATED DURING ABSENCE
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {threads.map((name, i) => (
                  <span key={i} style={{
                    fontSize: 11, background: 'var(--bg-3)', border: '1px solid var(--border)',
                    borderRadius: 6, padding: '3px 8px', color: 'var(--text-2)',
                  }}>
                    💬 {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {decisionCount === 0 && threadCount === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '12px 0' }}>
              No decisions or new threads during your absence.
            </div>
          )}

          <div style={{ fontSize: 11, color: 'var(--text-3)', background: 'var(--bg-3)', borderRadius: 6, padding: '8px 10px' }}>
            💡 To flag any VP decision for review, find it in the Decision Log and it will be tagged <strong>[CHAIRMAN REVIEW REQUESTED]</strong>.
          </div>
        </div>

        <div className="modal-footer" style={{ flexShrink: 0 }}>
          <button className="btn btn-primary" onClick={onClose}>
            Review Decisions Log
          </button>
        </div>
      </div>
    </div>
  )
}
