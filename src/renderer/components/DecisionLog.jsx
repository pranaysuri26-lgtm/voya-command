import { useState, useEffect } from 'react'
import AgentAvatar from './AgentAvatar'

const AGENT_COLORS = {
  CPO: '#818cf8',
  CMO: '#f472b6',
  CTO: '#22d3ee',
  CFO: '#34d399',
  COO: '#fbbf24',
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function DecisionLog() {
  const [decisions, setDecisions] = useState([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    load(query)
  }, [query])

  async function load(q) {
    const results = await window.voyaAPI.getDecisions(q || null)
    setDecisions(results)
  }

  return (
    <>
      <div className="panel-header">
        <span style={{ fontSize: 18, opacity: 0.6 }}>▤</span>
        <div>
          <h2>Decision Log</h2>
          <div className="panel-header-sub">{decisions.length} decisions</div>
        </div>
      </div>

      <div style={{ padding: '12px 20px 0', flexShrink: 0 }}>
        <input
          style={{
            width: '100%',
            background: 'var(--bg-3)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '8px 12px',
            color: 'var(--text-1)',
            fontSize: 13,
            outline: 'none',
          }}
          placeholder="Search decisions…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
        {decisions.length === 0 && (
          <div className="empty-state" style={{ paddingTop: 60 }}>
            <div className="empty-state-icon">📋</div>
            <h3>{query ? 'No results' : 'No decisions yet'}</h3>
            <p>{query ? 'Try a different search' : 'Approved and rejected items will appear here'}</p>
          </div>
        )}

        {decisions.map((d) => (
          <div key={d.id} style={{ marginBottom: 12 }}>
            <div
              style={{
                background: 'var(--bg-2)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <AgentAvatar agent={d.agent} size={20} rounded={5} />
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: AGENT_COLORS[d.agent],
                  }}
                >
                  {d.agent}
                </span>
                <span
                  className={`outcome-badge ${d.outcome}`}
                  style={{ marginLeft: 'auto' }}
                >
                  {d.outcome}
                </span>
              </div>

              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--text-1)',
                  marginBottom: 4,
                }}
              >
                {d.title}
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: 'var(--text-2)',
                  lineHeight: 1.45,
                  marginBottom: 6,
                }}
              >
                {d.description}
              </div>

              {d.notes && (
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--text-3)',
                    fontStyle: 'italic',
                    marginBottom: 6,
                  }}
                >
                  Note: {d.notes}
                </div>
              )}

              <div
                style={{
                  fontSize: 10,
                  color: 'var(--text-3)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {formatDate(d.decided_at)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
