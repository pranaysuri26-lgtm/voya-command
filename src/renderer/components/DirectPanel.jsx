import { useState, useEffect, useRef } from 'react'
import AgentAvatar from './AgentAvatar'

function formatTime(ts) {
  const d = new Date(ts)
  if (isNaN(d)) return ''
  const today = new Date()
  const isToday = d.toDateString() === today.toDateString()
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (isToday) return time
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`
}

function formatDate(ts) {
  const d = new Date(ts)
  if (isNaN(d)) return ''
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

function DateDivider({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', margin: '4px 0' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
      <span style={{ fontSize: 10, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
    </div>
  )
}

export default function DirectPanel({ currentRole = 'chairman', vpName = 'VP' }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)

  const isVp = currentRole === 'vp'
  const myLabel = isVp ? vpName : 'Chairman'
  const theirLabel = isVp ? 'Chairman' : vpName
  const myColor = isVp ? '#94A3B8' : 'var(--accent)'
  const theirColor = isVp ? 'var(--accent)' : '#94A3B8'

  useEffect(() => {
    loadHistory()
  }, [])

  useEffect(() => {
    const unsubWs = window.voyaAPI.on('ws-connected', () => loadHistory())
    const onFocus = () => loadHistory()
    window.addEventListener('focus', onFocus)
    return () => {
      unsubWs?.()
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  useEffect(() => {
    const unsub = window.voyaAPI.on('direct-message', (data) => {
      const msg = {
        id: `dm-${Date.now()}-${Math.random()}`,
        role: 'chairman',
        source: data.sender,
        content: data.content,
        timestamp: data.timestamp || new Date().toISOString(),
      }
      setMessages(prev => {
        // dedupe: don't add if last message has same content + source within 2s
        const last = prev[prev.length - 1]
        if (last && last.source === msg.source && last.content === msg.content) return prev
        return [...prev, msg]
      })
    })
    return () => unsub?.()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadHistory() {
    try {
      const msgs = await window.voyaAPI.getConversation('VP_DIRECT')
      setMessages(msgs)
    } catch {
      setMessages([])
    }
  }

  async function send() {
    const content = input.trim()
    if (!content || sending) return
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    const senderRole = isVp ? 'vp' : 'chairman'
    const optimistic = {
      id: `opt-${Date.now()}`,
      role: 'chairman',
      source: senderRole,
      content,
      timestamp: new Date().toISOString(),
      _local: true,
    }
    setMessages(prev => [...prev, optimistic])
    setSending(true)

    try {
      await window.voyaAPI.sendMessage('VP_DIRECT', content, [], senderRole)
    } catch (err) {
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'chairman',
        source: 'system',
        content: `⚠️ Failed to send: ${err.message}`,
        timestamp: new Date().toISOString(),
      }])
    } finally {
      setSending(false)
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  function handleInputChange(e) {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
  }

  // Group by date
  const grouped = []
  let lastDate = null
  for (const msg of messages) {
    const label = formatDate(msg.timestamp)
    if (label && label !== lastDate) {
      grouped.push({ type: 'divider', label, key: `div-${msg.id}` })
      lastDate = label
    }
    grouped.push({ type: 'msg', msg, key: msg.id })
  }

  return (
    <>
      <div className="panel-header">
        <div style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          background: '#94A3B822', border: '1px solid #94A3B844',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: '#94A3B8' }}>DM</span>
        </div>
        <div>
          <h2 style={{ color: theirColor }}>{theirLabel}</h2>
          <div className="panel-header-sub">Direct message</div>
        </div>
        <div style={{
          marginLeft: 'auto', fontSize: 10, color: 'var(--text-3)',
          background: 'var(--bg-3)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '3px 8px',
        }}>
          Private · only you two can see this
        </div>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && !sending && (
          <div className="empty-state">
            <div className="empty-state-icon">💬</div>
            <h3>Direct message</h3>
            <p>Send a private message to {theirLabel}. No agents can see this.</p>
          </div>
        )}

        {grouped.map(item => {
          if (item.type === 'divider') return <DateDivider key={item.key} label={item.label} />
          const { msg } = item
          const isSystem = msg.source === 'system'
          if (isSystem) {
            return (
              <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 0' }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
                <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{msg.content}</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
              </div>
            )
          }

          // figure out who sent this message
          const isMe = isVp ? msg.source === 'vp' : msg.source !== 'vp'
          const senderLabel = isMe ? myLabel : theirLabel
          const senderColor = isMe ? myColor : theirColor
          const senderAvatar = isMe
            ? (isVp ? 'VP' : 'CHAIRMAN')
            : (isVp ? 'CHAIRMAN' : 'VP')

          return (
            <div key={item.key} className={`msg ${isMe ? 'chairman' : 'agent'}`}>
              {!isMe && (
                <AgentAvatar agent={senderAvatar} size={28} rounded={7} />
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: '100%' }}>
                <div className="msg-bubble" style={{ userSelect: 'text', cursor: 'text' }}>
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{msg.content}</p>
                </div>
                <div className={`msg-meta ${isMe ? 'right' : ''}`}>
                  <span className="msg-sender" style={{ color: senderColor }}>{senderLabel}</span>
                  <span className="msg-time">{formatTime(msg.timestamp)}</span>
                </div>
              </div>
              {isMe && <AgentAvatar agent={senderAvatar} size={28} rounded={7} />}
            </div>
          )
        })}

        <div ref={bottomRef} />
      </div>

      <div className="chat-input-area">
        <div className="chat-input-wrap">
          <textarea
            ref={textareaRef}
            className="chat-input"
            rows={1}
            placeholder={`Message ${theirLabel}…`}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKey}
            disabled={sending}
          />
          <button className="send-btn" onClick={send} disabled={!input.trim() || sending}>
            ↑
          </button>
        </div>
        <div style={{ marginTop: 5, fontSize: 10, color: 'var(--text-3)' }}>
          Enter to send · Shift+Enter for newline · Private between Chairman and VP
        </div>
      </div>
    </>
  )
}
