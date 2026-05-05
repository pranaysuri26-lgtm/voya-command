import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import AgentAvatar from './AgentAvatar'

const AGENT_COLORS = {
  CPO: '#818cf8', CMO: '#f472b6', CTO: '#22d3ee',
  CFO: '#34d399', COO: '#fbbf24', FORGE: '#00BCD4',
}

const MENTION_RE     = /(@Chairman|@VP|@COO|@CPO|@CMO|@CTO|@CFO|@FORGE)/g
const MENTION_RE_TEST = /(@Chairman|@VP|@COO|@CPO|@CMO|@CTO|@CFO|@FORGE)/
const MENTION_COLORS = {
  '@Chairman': { bg: '#4f46e522', color: '#818cf8' },
  '@VP':       { bg: '#94A3B822', color: '#94A3B8' },
  '@COO':      { bg: '#fbbf2422', color: '#fbbf24' },
  '@CPO':      { bg: '#818cf822', color: '#818cf8' },
  '@CMO':      { bg: '#f472b622', color: '#f472b6' },
  '@CTO':      { bg: '#22d3ee22', color: '#22d3ee' },
  '@CFO':      { bg: '#34d39922', color: '#34d399' },
  '@FORGE':    { bg: '#00BCD422', color: '#00BCD4' },
}

// Render message text with all @mentions highlighted as pills
function renderWithMentions(text) {
  if (!text) return text
  const parts = text.split(MENTION_RE)
  return parts.map((part, i) => {
    const style = MENTION_COLORS[part]
    if (style) return (
      <span key={i} style={{
        display: 'inline-block', padding: '0 6px', borderRadius: 4,
        background: style.bg, color: style.color,
        fontWeight: 700, fontSize: '0.95em',
      }}>{part}</span>
    )
    return part
  })
}

function formatTime(ts) {
  const d = new Date(ts)
  const today = new Date()
  const isToday = d.toDateString() === today.toDateString()
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (isToday) return time
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`
}

function MemberAvatarStack({ members, max = 5 }) {
  const shown = members.slice(0, max)
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {shown.map((agent, i) => (
        <div
          key={agent}
          title={agent}
          style={{
            marginLeft: i === 0 ? 0 : -6,
            zIndex: shown.length - i,
            borderRadius: 5,
            border: '2px solid var(--bg-2)',
          }}
        >
          <AgentAvatar agent={agent} size={22} rounded={4} />
        </div>
      ))}
      {members.length > max && (
        <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 4 }}>
          +{members.length - max}
        </span>
      )}
    </div>
  )
}

function ThreadMessage({ msg, localFiles, vpName = 'VP' }) {
  const isChairman = msg.sender === 'chairman' || msg.sender === 'vp'
  const isVpMsg = msg.sender === 'vp'
  const isSystem = msg.sender === 'system'
  const color = isChairman ? (isVpMsg ? '#94A3B8' : 'var(--text-3)') : (AGENT_COLORS[msg.sender] || 'var(--text-2)')

  if (isSystem) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
        <span style={{ fontSize: 10, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{msg.content}</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
      </div>
    )
  }

  // Parse stored attachment metadata
  let storedAttachments = []
  try { if (msg.attachments) storedAttachments = JSON.parse(msg.attachments) } catch (_) {}
  // In-session: use localFiles for richer display (includes dataUrl for images)
  const displayAttachments = localFiles && localFiles.length > 0 ? localFiles : storedAttachments

  const approvalRe = /\[NEEDS APPROVAL:\s*([^|]+)\|([^\]]+)\]/g
  let cleanContent = msg.content.replace(approvalRe, '').trim()
  const approvals = []
  let m
  const re = /\[NEEDS APPROVAL:\s*([^|]+)\|([^\]]+)\]/g
  while ((m = re.exec(msg.content)) !== null) {
    approvals.push({ title: m[1].trim(), description: m[2].trim() })
  }

  function handleContextMenu(e) {
    e.preventDefault()
    const selected = window.getSelection()?.toString() || ''
    window.voyaAPI.showContextMenu(selected || cleanContent)
  }

  return (
    <div className={`msg ${isChairman ? 'chairman' : 'agent'}`}>
      {!isChairman && <AgentAvatar agent={msg.sender} size={28} rounded={7} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: '100%' }}>
        <div
          className="msg-bubble"
          style={{ userSelect: 'text', cursor: 'text' }}
          onContextMenu={handleContextMenu}
        >
          {MENTION_RE_TEST.test(cleanContent || msg.content)
            ? <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{renderWithMentions(cleanContent || msg.content)}</p>
            : <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanContent || msg.content}</ReactMarkdown>
          }
          {displayAttachments.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {displayAttachments.map((f, i) => f.dataUrl
                ? <img key={i} src={f.dataUrl} alt={f.name} style={{ maxWidth: 200, maxHeight: 150, borderRadius: 6, objectFit: 'cover' }} />
                : (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    background: 'var(--bg-3)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)', padding: '3px 8px',
                    fontSize: 10, color: 'var(--text-2)',
                  }}>
                    <span>{fileIcon(f.type)}</span>
                    <span>{f.name}</span>
                    {f.size && <span style={{ color: 'var(--text-3)' }}>{formatBytes(f.size)}</span>}
                  </div>
                )
              )}
            </div>
          )}
          {approvals.map((a, i) => (
            <div key={i} className="approval-pill">⚠ Needs approval: {a.title}</div>
          ))}
        </div>
        <div className={`msg-meta ${isChairman ? 'right' : ''}`}>
          <span className="msg-sender" style={{ color }}>
            {isVpMsg ? vpName : (isChairman ? 'Chairman' : msg.sender)}
          </span>
          {isVpMsg && (
            <span style={{
              fontSize: 9, fontWeight: 800, background: '#94A3B822',
              border: '1px solid #94A3B844', color: '#94A3B8',
              borderRadius: 4, padding: '1px 5px', marginLeft: 3,
            }}>VP</span>
          )}
          <span className="msg-time">{formatTime(msg.timestamp)}</span>
        </div>
      </div>
      {isChairman && <AgentAvatar agent="CHAIRMAN" size={28} rounded={7} />}
    </div>
  )
}

function AttachmentPreviews({ files, onRemove }) {
  if (!files.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
      {files.map((f, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--bg-3)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '4px 8px', maxWidth: 200,
        }}>
          {f.isImage
            ? <img src={f.dataUrl} style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }} alt="" />
            : <span style={{ fontSize: 16 }}>{fileIcon(f.type)}</span>
          }
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
            <div style={{ fontSize: 9, color: 'var(--text-3)' }}>{formatBytes(f.size)}</div>
          </div>
          <button onClick={() => onRemove(i)} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
        </div>
      ))}
    </div>
  )
}

function fileIcon(type = '') {
  if (type.startsWith('image/')) return '🖼'
  if (type.includes('pdf')) return '📄'
  if (type.includes('json')) return '{}'
  if (type.includes('javascript') || type.includes('typescript') || type.includes('jsx') || type.includes('tsx')) return '⚡'
  return '📎'
}

function formatBytes(b) {
  if (b < 1024) return `${b}B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)}KB`
  return `${(b / 1048576).toFixed(1)}MB`
}

async function readFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    const isImg = file.type.startsWith('image/')
    reader.onload = (e) => resolve({
      name: file.name, type: file.type, size: file.size, isImage: isImg,
      dataUrl: isImg ? e.target.result : null,
      base64: isImg ? e.target.result.split(',')[1] : null,
      text: isImg ? null : e.target.result,
    })
    if (isImg) reader.readAsDataURL(file)
    else reader.readAsText(file)
  })
}

const ACCEPTED = '.png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.md,.ts,.tsx,.js,.jsx,.json,.css,.html'

const ALL_MENTIONABLE = ['COO', 'CPO', 'CMO', 'CTO', 'CFO', 'FORGE', 'Chairman', 'VP']

export default function ThreadPanel({ threadId, onNewApprovals, onDelete, currentRole = 'chairman', vpActing = false, vpName = 'VP' }) {
  const [thread, setThread] = useState(null)
  const [messages, setMessages] = useState([])
  const [typingAgents, setTypingAgents] = useState(new Set())
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [pendingFiles, setPendingFiles] = useState([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [mentionQuery, setMentionQuery] = useState(null)   // null or string being typed after @
  const [mentionIndex, setMentionIndex] = useState(0)
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!threadId) return
    loadThread()
    setInput('')
    setPendingFiles([])
  }, [threadId])

  // Reload messages when WS reconnects (Railway wake) or window regains focus
  useEffect(() => {
    if (!threadId) return
    const unsubWs = window.voyaAPI.on('ws-connected', () => loadThread())
    const onFocus = () => loadThread()
    window.addEventListener('focus', onFocus)
    return () => {
      unsubWs?.()
      window.removeEventListener('focus', onFocus)
    }
  }, [threadId])

  useEffect(() => {
    const unsub = window.voyaAPI.on('thread-update', (update) => {
      if (update.threadId !== threadId) return

      if (update.type === 'typing') {
        setTypingAgents(prev => new Set([...prev, update.agent]))
        return
      }

      if (update.type === 'message') {
        setTypingAgents(prev => {
          const next = new Set(prev)
          next.delete(update.agent)
          return next
        })
        const msg = {
          id: update.messageId,
          thread_id: update.threadId,
          sender: update.agent,
          content: update.content,
          timestamp: update.timestamp,
        }
        setMessages(prev => {
          if (prev.find(m => m.id === msg.id)) return prev
          return [...prev, msg]
        })
        if (update.approvals?.length > 0) onNewApprovals?.(update.approvals)
        return
      }

      if (update.type === 'done') {
        setTypingAgents(new Set())
      }
    })
    return () => unsub?.()
  }, [threadId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typingAgents])

  async function loadThread() {
    const { thread: t, messages: msgs } = await window.voyaAPI.getThread(threadId)
    setThread(t)
    setMessages(msgs)
    setTypingAgents(new Set())
  }

  async function handleFiles(fileList) {
    const files = await Promise.all(Array.from(fileList).map(readFile))
    setPendingFiles(prev => {
      const combined = [...prev, ...files]
      return combined.slice(0, 10)
    })
  }

  async function send() {
    const content = input.trim()
    if ((!content && pendingFiles.length === 0) || sending) return

    setSending(true)
    setInput('')
    setMentionQuery(null)
    const filesToSend = [...pendingFiles]
    setPendingFiles([])
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    const attachments = filesToSend.map(f => ({
      name: f.name, type: f.type, size: f.size,
      base64: f.base64 || null, text: f.text || null,
    }))

    const senderRole = currentRole === 'vp' ? 'vp' : 'chairman'
    const result = await window.voyaAPI.sendThreadMessage(threadId, content, attachments, senderRole)
    const msg = {
      id: result.messageId, thread_id: threadId,
      sender: result.sender || senderRole, content: result.content || content,
      timestamp: result.timestamp || new Date().toISOString(),
      _localFiles: filesToSend,   // keep for in-session preview
    }
    setMessages(prev => {
      if (prev.find(m => m.id === msg.id)) return prev
      return [...prev, msg]
    })
    setSending(false)
  }

  // Compute which members of this thread are mentionable (AI agents + humans)
  const threadMentionable = thread
    ? ALL_MENTIONABLE.filter(m => {
        const upper = m.toUpperCase()
        return thread.members.some(tm => tm.toUpperCase() === upper) || m === 'Chairman' || m === 'VP'
      })
    : ALL_MENTIONABLE

  // Filtered mention suggestions
  const mentionSuggestions = mentionQuery !== null
    ? threadMentionable.filter(m => m.toLowerCase().startsWith(mentionQuery.toLowerCase()))
    : []

  function insertMention(name) {
    const ta = textareaRef.current
    if (!ta) return
    const val = ta.value
    const cursor = ta.selectionStart
    // Find the @ that triggered the picker
    const before = val.slice(0, cursor)
    const atPos = before.lastIndexOf('@')
    if (atPos === -1) return
    const newVal = val.slice(0, atPos) + '@' + name + ' ' + val.slice(cursor)
    setInput(newVal)
    setMentionQuery(null)
    setMentionIndex(0)
    // Move cursor after inserted mention
    requestAnimationFrame(() => {
      ta.focus()
      const pos = atPos + name.length + 2
      ta.setSelectionRange(pos, pos)
    })
  }

  function handleKey(e) {
    if (mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => (i + 1) % mentionSuggestions.length); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setMentionIndex(i => (i - 1 + mentionSuggestions.length) % mentionSuggestions.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionSuggestions[mentionIndex]); return }
      if (e.key === 'Escape') { setMentionQuery(null); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  function handleInputChange(e) {
    const val = e.target.value
    setInput(val)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'

    // Detect @mention typing
    const cursor = e.target.selectionStart
    const before = val.slice(0, cursor)
    const match = before.match(/@(\w*)$/)
    if (match) {
      setMentionQuery(match[1])
      setMentionIndex(0)
    } else {
      setMentionQuery(null)
    }
  }

  if (!thread) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Loading thread…</div>
      </div>
    )
  }

  const typingList = [...typingAgents]

  return (
    <>
      <div className="panel-header">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h2 style={{ color: 'var(--text-1)', margin: 0 }}>{thread.name}</h2>
          <MemberAvatarStack members={thread.members} />
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {currentRole === 'vp' && (
            <span style={{
              fontSize: 9, fontWeight: 800,
              background: vpActing ? '#78350f33' : '#94A3B822',
              border: `1px solid ${vpActing ? '#f59e0b44' : '#94A3B844'}`,
              color: vpActing ? '#fbbf24' : '#94A3B8',
              borderRadius: 5, padding: '2px 7px', letterSpacing: 0.4,
            }}>
              {vpActing ? `${vpName} · ACTING` : `${vpName} · VP`}
            </span>
          )}
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
            {thread.members.join(' · ')}
          </span>
          {onDelete && (
            <button
              className="btn btn-secondary"
              style={{ fontSize: 11, padding: '3px 9px', color: 'var(--text-3)' }}
              onClick={() => {
                if (window.confirm(`Archive "${thread.name}"? The thread and all its messages will be preserved — you can restore it from the sidebar.`)) {
                  onDelete(threadId)
                }
              }}
              title="Archive this thread"
            >
              Archive
            </button>
          )}
        </div>
      </div>

      <div
        className="chat-messages"
        style={{ position: 'relative' }}
        onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDragOver(false) }}
        onDrop={e => { e.preventDefault(); setIsDragOver(false); handleFiles(e.dataTransfer.files) }}
      >
        {isDragOver && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(79,70,229,0.12)',
            border: '2px dashed var(--accent)', borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10, pointerEvents: 'none',
          }}>
            <span style={{ fontSize: 14, color: 'var(--accent)', fontWeight: 600 }}>Drop to attach</span>
          </div>
        )}
        {messages.length === 0 && typingList.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">💬</div>
            <h3>Start the thread</h3>
            <p>
              {thread.members.join(', ')} will all respond to your message.
            </p>
          </div>
        )}

        {messages.map(msg => (
          <ThreadMessage key={msg.id} msg={msg} localFiles={msg._localFiles} vpName={vpName} />
        ))}

        {typingList.length > 0 && (
          <div className="typing-indicator">
            <div style={{ display: 'flex', gap: 4 }}>
              {typingList.map(a => (
                <AgentAvatar key={a} agent={a} size={22} rounded={5} />
              ))}
            </div>
            <div className="typing-dots">
              <div className="typing-dot" />
              <div className="typing-dot" />
              <div className="typing-dot" />
            </div>
            <span>{typingList.join(', ')} thinking…</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="chat-input-area" style={{ position: 'relative' }}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED}
          style={{ display: 'none' }}
          onChange={e => { handleFiles(e.target.files); e.target.value = '' }}
        />
        <AttachmentPreviews files={pendingFiles} onRemove={i => setPendingFiles(prev => prev.filter((_, idx) => idx !== i))} />

        {/* @mention picker */}
        {mentionSuggestions.length > 0 && (
          <div style={{
            position: 'absolute', bottom: '100%', left: 0, right: 0,
            background: 'var(--bg-2)', border: '1px solid var(--border)',
            borderRadius: 8, marginBottom: 4, overflow: 'hidden',
            boxShadow: '0 -4px 20px rgba(0,0,0,0.3)', zIndex: 50,
          }}>
            <div style={{ padding: '4px 10px 2px', fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.06em' }}>
              MENTION — @{mentionQuery || '…'}
            </div>
            {mentionSuggestions.map((name, idx) => {
              const color = MENTION_COLORS[`@${name}`]?.color || 'var(--text-2)'
              return (
                <div
                  key={name}
                  onMouseDown={e => { e.preventDefault(); insertMention(name) }}
                  style={{
                    padding: '6px 12px', cursor: 'pointer', fontSize: 12,
                    fontWeight: idx === mentionIndex ? 700 : 400,
                    background: idx === mentionIndex ? 'var(--bg-3)' : 'transparent',
                    color, display: 'flex', alignItems: 'center', gap: 8,
                  }}
                >
                  <AgentAvatar agent={name.toUpperCase()} size={16} rounded={4} />
                  <span>@{name}</span>
                  {idx === mentionIndex && (
                    <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-3)' }}>↵ to insert</span>
                  )}
                </div>
              )
            })}
            <div style={{ padding: '4px 10px 6px', fontSize: 9, color: 'var(--text-3)' }}>
              ↑↓ navigate · ↵/Tab insert · Esc dismiss · only mentioned agents reply
            </div>
          </div>
        )}

        <div className="chat-input-wrap">
          <button
            onClick={() => fileInputRef.current.click()}
            style={{
              background: 'none', border: 'none', color: 'var(--text-3)',
              cursor: 'pointer', fontSize: 16, padding: '0 8px', lineHeight: 1,
              display: 'flex', alignItems: 'center',
            }}
            title="Attach file"
          >
            📎
          </button>
          <textarea
            ref={textareaRef}
            className="chat-input"
            rows={1}
            placeholder={`Message ${thread.name}… · type @ to mention`}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKey}
            disabled={sending}
          />
          <button className="send-btn" onClick={send} disabled={(!input.trim() && pendingFiles.length === 0) || sending}>
            ↑
          </button>
        </div>
        <div style={{ marginTop: 5, fontSize: 10, color: 'var(--text-3)' }}>
          Enter · Shift+Enter newline · 📎 attach · @ to mention · @mention = only that agent replies
        </div>
      </div>
    </>
  )
}
