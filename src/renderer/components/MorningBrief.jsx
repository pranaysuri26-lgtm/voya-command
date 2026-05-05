import { useState, useEffect } from 'react'
import AgentAvatar from './AgentAvatar'

const AGENT_COLORS = {
  CPO: '#818cf8', CMO: '#f472b6', CTO: '#22d3ee',
  CFO: '#34d399', COO: '#fbbf24', FORGE: '#00BCD4',
}
const PRIORITY_COLORS = { urgent: '#ef4444', high: '#f97316', medium: '#eab308', low: '#6b7280' }

function formatRelative(ts) {
  if (!ts) return ''
  const diff = Date.now() - new Date(ts)
  if (diff < 3600000)  return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

function formatDeadline(d) {
  if (!d) return null
  const date = new Date(d)
  const today = new Date(); today.setHours(0,0,0,0)
  const diff = Math.ceil((date - today) / 86400000)
  if (diff < 0)  return { label: `${Math.abs(diff)}d overdue`, color: '#ef4444' }
  if (diff === 0) return { label: 'Due today', color: '#f97316' }
  return { label: date.toLocaleDateString([], { month: 'short', day: 'numeric' }), color: 'var(--text-3)' }
}

export default function MorningBrief({ onClose, onSelectAgent, onViewTasks }) {
  const [brief, setBrief] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const data = await window.voyaAPI.getDailyBrief()
      setBrief(data)
    } catch (e) {
      console.error('[MorningBrief]', e)
    } finally {
      setLoading(false)
    }
  }

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  const dateStr = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Preparing your brief…</div>
      </div>
    )
  }

  const AGENTS = ['COO', 'CPO', 'CMO', 'CTO', 'CFO', 'FORGE']
  const stats = brief?.stats || {}

  // Top attention items
  const attentionItems = [
    ...(brief?.pendingApprovals || []).slice(0, 3).map(a => ({
      type: 'approval', label: a.title, sub: `${a.agent} · pending approval`, color: '#f59e0b',
    })),
    ...(brief?.overdueTasks || []).slice(0, 3).map(t => ({
      type: 'task', label: t.title, sub: `Owned by ${t.owner?.toUpperCase()} · overdue`, color: '#ef4444',
    })),
  ].slice(0, 5)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Top bar */}
      <div style={{
        padding: '16px 24px 12px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        flexShrink: 0,
        background: 'linear-gradient(180deg, var(--bg-3) 0%, transparent 100%)',
      }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, marginBottom: 2 }}>{dateStr}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-1)' }}>{greeting()}, Chairman</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
            {stats.pendingCount > 0 && <span style={{ color: '#f59e0b' }}>{stats.pendingCount} pending · </span>}
            {stats.overdueCount > 0 && <span style={{ color: '#ef4444' }}>{stats.overdueCount} overdue · </span>}
            {stats.inProgressCount > 0 && <span style={{ color: 'var(--text-2)' }}>{stats.inProgressCount} in progress · </span>}
            <span>{stats.decisionsToday} decisions today</span>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'var(--bg-3)', border: '1px solid var(--border)',
            borderRadius: 6, padding: '5px 10px', fontSize: 11,
            color: 'var(--text-3)', cursor: 'pointer',
          }}
        >✕ Close</button>
      </div>

      {/* Body — 3 column layout */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', gap: 16 }}>

        {/* LEFT — Needs attention */}
        <div style={{ width: 220, flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 10, letterSpacing: '0.08em' }}>
            NEEDS ATTENTION
          </div>

          {attentionItems.length === 0 ? (
            <div style={{
              background: '#22c55e11', border: '1px solid #22c55e33',
              borderRadius: 8, padding: '12px 14px', fontSize: 12, color: '#22c55e',
            }}>
              ✓ All clear — nothing urgent
            </div>
          ) : attentionItems.map((item, i) => (
            <div key={i} style={{
              background: 'var(--bg-3)', border: `1px solid ${item.color}33`,
              borderLeft: `3px solid ${item.color}`,
              borderRadius: 6, padding: '8px 10px', marginBottom: 6,
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-1)', marginBottom: 2 }}>{item.label}</div>
              <div style={{ fontSize: 10, color: item.color }}>{item.sub}</div>
            </div>
          ))}

          {/* Tasks summary */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 8, letterSpacing: '0.08em' }}>
              TASK STATUS
            </div>
            {[
              { label: 'To Do',       count: stats.todoCount,        color: '#6b7280' },
              { label: 'In Progress', count: stats.inProgressCount,  color: '#f59e0b' },
              { label: 'Done',        count: stats.doneCount,        color: '#22c55e' },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: row.color }} />
                  <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{row.label}</span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: row.color }}>{row.count || 0}</span>
              </div>
            ))}
            <button
              onClick={onViewTasks}
              style={{
                marginTop: 8, width: '100%', background: 'var(--bg-3)',
                border: '1px solid var(--border)', borderRadius: 6,
                padding: '5px 0', fontSize: 11, color: 'var(--text-3)',
                cursor: 'pointer',
              }}
            >View all tasks →</button>
          </div>
        </div>

        {/* CENTER — Agent headlines */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 10, letterSpacing: '0.08em' }}>
            EXECUTIVE HEADLINES
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {AGENTS.map(agent => {
              const headline = brief?.agentHeadlines?.[agent]
              const color = AGENT_COLORS[agent] || 'var(--text-3)'
              return (
                <div
                  key={agent}
                  onClick={() => { onSelectAgent?.(agent); onClose?.() }}
                  style={{
                    background: 'var(--bg-3)', border: '1px solid var(--border)',
                    borderLeft: `3px solid ${color}`,
                    borderRadius: 8, padding: '10px 14px', cursor: 'pointer',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-3)'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <AgentAvatar agent={agent} size={18} rounded={4} />
                    <span style={{ fontSize: 11, fontWeight: 800, color }}>{agent}</span>
                    {headline?.timestamp && (
                      <span style={{ fontSize: 9, color: 'var(--text-3)', marginLeft: 'auto' }}>
                        {formatRelative(headline.timestamp)}
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontSize: 12, color: headline ? 'var(--text-2)' : 'var(--text-3)',
                    lineHeight: 1.5, fontStyle: headline ? 'normal' : 'italic',
                  }}>
                    {headline?.content || 'No recent activity — send them a message'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* RIGHT — Recent decisions */}
        <div style={{ width: 200, flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 10, letterSpacing: '0.08em' }}>
            RECENT DECISIONS
          </div>
          {(brief?.allRecentDecisions || []).length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>No decisions yet</div>
          ) : (brief?.allRecentDecisions || []).map(d => (
            <div key={d.id} style={{
              borderBottom: '1px solid var(--border-subtle)', paddingBottom: 8, marginBottom: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: AGENT_COLORS[d.agent] || 'var(--text-3)' }}>{d.agent}</span>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 3,
                  background: d.outcome === 'approved' ? '#22c55e22' : '#ef444422',
                  color: d.outcome === 'approved' ? '#22c55e' : '#ef4444',
                }}>{d.outcome}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-1)', lineHeight: 1.4 }}>{d.title}</div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
                {formatRelative(d.decided_at)}
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
