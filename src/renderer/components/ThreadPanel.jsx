import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import AgentAvatar from './AgentAvatar'

const AGENT_COLORS = {
  CPO: '#818cf8', CMO: '#f472b6', CTO: '#22d3ee',
  CFO: '#34d399', COO: '#fbbf24', FORGE: '#00BCD4',
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
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {cleanContent || msg.content}
          </ReactMarkdown>
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

export default function ThreadPanel({ threadId, onNewApprovals, currentRole = 'chairman', vpActing = false, vpName = 'VP' }) {
  const [thread, setThread] = useState(null)
  const [messages, setMessages] = useState([])
  const [typingAgents, setTypingAgents] = useState(new Set())
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [pendingFiles, setPendingFiles] = useState([])
  const [isDragOver, setIsDragOver] = useState(false)
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!threadId) return
    loadThread()
    setInput('')
    setPendingFiles([])
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

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  function handleInputChange(e) {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
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

      <div className="chat-input-area">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED}
          style={{ display: 'none' }}
          onChange={e => { handleFiles(e.target.files); e.target.value = '' }}
        />
        <AttachmentPreviews files={pendingFiles} onRemove={i => setPendingFiles(prev => prev.filter((_, idx) => idx !== i))} />
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
            placeholder={`Message ${thread.name}…`}
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
          Enter to send · Shift+Enter for newline · 📎 to attach · drag & drop files
        </div>
      </div>
    </>
  )
}
