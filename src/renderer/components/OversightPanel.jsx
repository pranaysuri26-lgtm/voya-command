import { useState, useEffect, useRef } from 'react'
import AgentAvatar from './AgentAvatar'

const AGENTS = ['CPO', 'CMO', 'CTO', 'CFO', 'COO', 'FORGE']

const AGENT_COLORS = {
  CPO: '#818cf8', CMO: '#f472b6', CTO: '#22d3ee',
  CFO: '#34d399', COO: '#fbbf24', FORGE: '#00BCD4',
}

function formatRelative(ts) {
  const d = new Date(ts)
  const diff = Date.now() - d
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export default function OversightPanel({ onSelectThread, onSelectAgent }) {
  const [messages, setMessages] = useState([])
  const [agentFilter, setAgentFilter] = useState('ALL')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [agentFilter])

  // Real-time: thread agent messages
  useEffect(() => {
    const unsub = window.vondrerAPI.on('thread-update', (update) => {
      if (update.type !== 'message') return
      setMessages(prev => {
        const id = `tm-${update.messageId}`
        if (prev.find(m => m.id === id)) return prev
        return [{
          id,
          thread_id: update.threadId,
          sender: update.agent,
          content: update.content,
          timestamp: update.timestamp,
          thread_name: update._threadName || '…',
          source_type: 'thread',
        }, ...prev]
      })
    })
    return () => unsub?.()
  }, [])

  // Real-time: direct 1-on-1 chat agent messages
  useEffect(() => {
    const unsub = window.vondrerAPI.on('oversight-direct-message', (msg) => {
      if (agentFilter !== 'ALL' && msg.sender !== agentFilter) return
      setMessages(prev => {
        if (prev.find(m => m.id === msg.id)) return prev
        return [msg, ...prev]
      })
    })
    return () => unsub?.()
  }, [agentFilter])

  async function load() {
    setLoading(true)
    try {
      const filter = agentFilter === 'ALL' ? null : agentFilter
      const msgs = await window.vondrerAPI.getOversightMessages(filter, 200)
      setMessages(Array.isArray(msgs) ? msgs : [])
    } catch (err) {
      console.error('[Oversight] load failed:', err)
      setMessages([])
    } finally {
      setLoading(false)
    }
  }

  const filtered = search.trim()
    ? messages.filter(m =>
        m.content.toLowerCase().includes(search.toLowerCase()) ||
        m.thread_name?.toLowerCase().includes(search.toLowerCase())
      )
    : messages

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Filter bar */}
      <div style={{
        padding: '10px 12px 0',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {['ALL', ...AGENTS].map(a => (
            <button
              key={a}
              onClick={() => setAgentFilter(a)}
              style={{
                fontSize: 10, fontWeight: 700,
                padding: '3px 8px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: agentFilter === a
                  ? (AGENT_COLORS[a] || 'var(--accent)')
                  : 'var(--bg-3)',
                color: agentFilter === a ? '#000' : 'var(--text-3)',
                transition: 'all 0.12s',
              }}
            >
              {a}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search agent messages…"
          style={{
            background: 'var(--bg-3)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '5px 10px',
            fontSize: 11, color: 'var(--text-1)', outline: 'none',
            marginBottom: 8,
          }}
        />
      </div>

      {/* Message feed */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {loading && (
          <div style={{ padding: '20px 12px', fontSize: 11, color: 'var(--text-3)', textAlign: 'center' }}>
            Loading…
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: '20px 12px', fontSize: 11, color: 'var(--text-3)', textAlign: 'center' }}>
            {search ? 'No matches' : 'No agent activity yet'}
          </div>
        )}
        {filtered.map(msg => (
          <OversightItem key={msg.id} msg={msg} onSelectThread={onSelectThread} onSelectAgent={onSelectAgent} />
        ))}
      </div>
    </div>
  )
}

function OversightItem({ msg, onSelectThread, onSelectAgent }) {
  const color = AGENT_COLORS[msg.sender] || 'var(--text-2)'
  const preview = msg.content.replace(/\[NEEDS APPROVAL:[^\]]+\]/g, '').replace(/\[OPEN DISCUSSION:[^\]]+\]/g, '').trim().slice(0, 100)
  const isDirect = msg.source_type === 'direct' || !msg.thread_id

  function handleClick() {
    if (isDirect) {
      onSelectAgent?.(msg.sender)
    } else {
      onSelectThread?.(msg.thread_id)
    }
  }

  return (
    <div
      onClick={handleClick}
      style={{
        padding: '8px 12px', cursor: 'pointer',
        borderBottom: '1px solid var(--border-subtle)',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-3)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
        <AgentAvatar agent={msg.sender} size={16} rounded={3} />
        <span style={{ fontSize: 10, fontWeight: 700, color }}>{msg.sender}</span>
        <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{isDirect ? '→' : 'in'}</span>
        <span style={{ fontSize: 10, color: isDirect ? 'var(--text-3)' : 'var(--text-2)', fontWeight: 600, fontStyle: isDirect ? 'italic' : 'normal' }}>
          {msg.thread_name}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-3)', flexShrink: 0 }}>
          {formatRelative(msg.timestamp)}
        </span>
      </div>
      <div style={{
        fontSize: 11, color: 'var(--text-2)', lineHeight: 1.4,
        overflow: 'hidden', display: '-webkit-box',
        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
      }}>
        {preview || '(empty)'}
      </div>
    </div>
  )
}
