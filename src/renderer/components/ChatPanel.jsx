import { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import AgentAvatar from './AgentAvatar'

// C-suite agents for @All broadcasts
const AGENTS = ['CPO', 'CMO', 'CTO', 'CFO', 'COO']
// All mentionable agents (includes FORGE for targeted messages)
const ALL_MENTIONABLE = ['CPO', 'CMO', 'CTO', 'CFO', 'COO', 'FORGE']

const AGENT_COLORS = {
  CPO: '#818cf8',
  CMO: '#f472b6',
  CTO: '#22d3ee',
  CFO: '#34d399',
  COO: '#fbbf24',
  FORGE: '#00BCD4',
  ALL: '#6366f1',
}

const AGENT_ROLES = {
  CPO: 'Chief Product Officer',
  CMO: 'Chief Marketing Officer',
  CTO: 'Chief Technology Officer',
  CFO: 'Chief Financial Officer',
  COO: 'Chief Operating Officer',
  FORGE: 'AI Developer',
  ALL: 'All Executives',
}

const MENTION_RE = /@(CPO|CMO|CTO|CFO|COO|FORGE)/gi
const ACCEPTED = '.png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.md,.ts,.tsx,.js,.jsx,.json,.css,.html'

function fileIcon(type = '') {
  if (type.startsWith('image/')) return '🖼'
  if (type.includes('pdf')) return '📄'
  if (type.includes('json')) return '{}'
  if (type.includes('javascript') || type.includes('typescript')) return '⚡'
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

function formatTime(ts) {
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDate(ts) {
  const d = new Date(ts)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

function parseMentions(text) {
  const found = []
  let m
  const re = /@(All|CPO|CMO|CTO|CFO|COO|FORGE)/gi
  while ((m = re.exec(text)) !== null) {
    const upper = m[1].toUpperCase()
    if (!found.includes(upper)) found.push(upper)
  }
  return found
}

function SystemNotice({ msg }) {
  const approved = msg.content.includes('APPROVED')
  const color = approved ? 'var(--success)' : 'var(--danger)'
  const dim = approved ? 'var(--success-dim)' : 'var(--danger-dim)'
  const titleMatch = msg.content.match(/"([^"]+)"/)
  const title = titleMatch ? titleMatch[1] : 'proposal'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 0' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
      <span style={{
        fontSize: 10, color, background: dim,
        border: `1px solid ${color}55`,
        padding: '3px 12px', borderRadius: 10, whiteSpace: 'nowrap',
      }}>
        {approved ? '✓' : '✗'} Chairman {approved ? 'approved' : 'rejected'}: "{title}"
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
    </div>
  )
}

function MessageBubble({ msg, agent }) {
  const isChairman = msg.role === 'chairman'
  const localFiles = msg._localFiles || []

  // System board-resolution messages render as a notice, not a bubble
  if (msg.source === 'system') return <SystemNotice msg={msg} />

  const approvalRe = /\[NEEDS APPROVAL:\s*([^|]+)\|([^\]]+)\]/g
  let cleanContent = msg.content.replace(approvalRe, '').trim()
  const approvals = []
  let m
  const re = /\[NEEDS APPROVAL:\s*([^|]+)\|([^\]]+)\]/g
  while ((m = re.exec(msg.content)) !== null) {
    approvals.push({ title: m[1].trim(), description: m[2].trim() })
  }

  // DEV status badges
  const statusMatch = msg.content.match(/\[STATUS:\s*([^\]]+)\]/i)
  const nextMatch = msg.content.match(/\[NEXT:\s*([^\]]+)\]/i)
  const blockerMatch = msg.content.match(/\[BLOCKER:\s*([^\]]+)\]/i)
  // Strip DEV flags from displayed content
  if (statusMatch || nextMatch || blockerMatch) {
    cleanContent = cleanContent
      .replace(/\[STATUS:[^\]]+\]/gi, '')
      .replace(/\[NEXT:[^\]]+\]/gi, '')
      .replace(/\[BLOCKER:[^\]]+\]/gi, '')
      .trim()
  }

  const displayAgent = msg.agent || agent

  function handleContextMenu(e) {
    e.preventDefault()
    const selected = window.getSelection()?.toString() || ''
    window.voyaAPI.showContextMenu(selected || cleanContent)
  }

  return (
    <div className={`msg ${isChairman ? 'chairman' : 'agent'}`}>
      {!isChairman && <AgentAvatar agent={displayAgent} size={28} rounded={7} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: '100%' }}>
        <div
          className={`msg-bubble ${msg.source === 'autonomous' ? 'msg-bubble-auto' : ''}`}
          style={{ userSelect: 'text', cursor: 'text' }}
          onContextMenu={handleContextMenu}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {cleanContent || msg.content}
          </ReactMarkdown>
          {localFiles.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {localFiles.map((f, i) => f.dataUrl
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
                    <span style={{ color: 'var(--text-3)' }}>{formatBytes(f.size)}</span>
                  </div>
                )
              )}
            </div>
          )}
          {approvals.map((a, i) => (
            <div key={i} className="approval-pill">⚠ Needs approval: {a.title}</div>
          ))}
          {statusMatch && (
            <div className={`dev-status-badge dev-status-${statusMatch[1].toLowerCase().replace(/\s+/g, '-')}`}>
              ● STATUS: {statusMatch[1].trim()}
            </div>
          )}
          {blockerMatch && blockerMatch[1].trim().toLowerCase() !== 'none' && (
            <div className="dev-blocker-badge">⚠ BLOCKER: {blockerMatch[1].trim()}</div>
          )}
          {nextMatch && (
            <div className="dev-next-badge">→ NEXT: {nextMatch[1].trim()}</div>
          )}
        </div>
        <div className={`msg-meta ${isChairman ? 'right' : ''}`}>
          <span
            className="msg-sender"
            style={{ color: isChairman ? (msg.source === 'vp' ? '#94A3B8' : 'var(--text-3)') : AGENT_COLORS[displayAgent] }}
          >
            {isChairman ? (msg.source === 'vp' ? (msg._vpName || 'VP') : 'Chairman') : displayAgent}
          </span>
          {isChairman && msg.source === 'vp' && (
            <span style={{
              fontSize: 9, fontWeight: 800, background: '#94A3B822',
              border: '1px solid #94A3B844', color: '#94A3B8',
              borderRadius: 4, padding: '1px 5px', marginLeft: 3,
            }}>VP</span>
          )}
          <span className="msg-time">{formatTime(msg.timestamp)}</span>
          {msg.source === 'autonomous' && (
            <span style={{ fontSize: 9, color: 'var(--text-3)', fontStyle: 'italic', marginLeft: 2 }}>
              ● auto
            </span>
          )}
        </div>
      </div>
      {isChairman && <AgentAvatar agent="CHAIRMAN" size={28} rounded={7} />}
    </div>
  )
}

function DateDivider({ label }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '4px 0', margin: '4px 0',
    }}>
      <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
      <span style={{ fontSize: 10, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
    </div>
  )
}

function Toast({ message, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500)
    return () => clearTimeout(t)
  }, [])
  return (
    <div style={{
      position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)',
      background: 'var(--bg-4)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)', padding: '8px 16px',
      fontSize: 12, color: 'var(--text-1)', whiteSpace: 'nowrap',
      zIndex: 50, pointerEvents: 'none',
      boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    }}>
      {message}
    </div>
  )
}

export default function ChatPanel({ selectedAgent, onNewApprovals, onEscalateToBoard, currentRole = 'chairman', vpActing = false, vpName = 'VP' }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [mentionSearch, setMentionSearch] = useState(null) // null=closed, string=filter
  const [mentionTargets, setMentionTargets] = useState([]) // parsed @mentions in input
  const [toast, setToast] = useState(null)
  const [screenshotting, setScreenshotting] = useState(false)
  const [pendingFiles, setPendingFiles] = useState([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [thinkingAgent, setThinkingAgent] = useState(null)
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)
  const inputWrapRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    loadHistory()
    setPendingFiles([])
  }, [selectedAgent])

  // Reload on WS reconnect (Railway wake) or window focus
  useEffect(() => {
    const unsubWs = window.voyaAPI.on('ws-connected', () => loadHistory())
    const onFocus = () => loadHistory()
    window.addEventListener('focus', onFocus)
    return () => {
      unsubWs?.()
      window.removeEventListener('focus', onFocus)
    }
  }, [selectedAgent])

  // Listen for agent acknowledgment pushed from main after approval resolution.
  // Show inline if viewing that agent; DB write already happened so loadHistory() picks it up on next visit.
  useEffect(() => {
    const unsub = window.voyaAPI.on('agent-acknowledgment', (data) => {
      if (data.agent !== selectedAgent) return
      const notice = {
        id: `sys-${Date.now()}`,
        agent: data.agent,
        role: 'chairman',
        source: 'system',
        content: data.notification,
        timestamp: data.timestamp,
      }
      const ack = {
        id: `ack-${Date.now()}`,
        agent: data.agent,
        role: 'agent',
        source: 'autonomous',
        content: data.content,
        timestamp: data.timestamp,
      }
      setMessages(prev => [...prev, notice, ack])
    })
    return () => unsub?.()
  }, [selectedAgent])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Close mention dropdown on outside click
  useEffect(() => {
    function handler(e) {
      if (mentionSearch !== null && !inputWrapRef.current?.contains(e.target)) {
        setMentionSearch(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [mentionSearch])

  async function loadHistory() {
    if (selectedAgent === 'ALL') { setMessages([]); return }
    const msgs = await window.voyaAPI.getConversation(selectedAgent)
    setMessages(msgs)
  }

  function handleInputChange(e) {
    const val = e.target.value
    setInput(val)

    // Resize textarea
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'

    // Detect @mention trigger: last @ with no space after it = actively typing mention
    const lastAt = val.lastIndexOf('@')
    if (lastAt !== -1) {
      const afterAt = val.slice(lastAt + 1)
      if (!afterAt.includes(' ') && !afterAt.includes('\n')) {
        setMentionSearch(afterAt.toUpperCase())
      } else {
        setMentionSearch(null)
      }
    } else {
      setMentionSearch(null)
    }

    // Track completed @mentions for routing chips
    setMentionTargets(parseMentions(val))
  }

  function selectMention(agent) {
    const lastAt = input.lastIndexOf('@')
    const before = input.slice(0, lastAt)
    const newInput = `${before}@${agent} `
    setInput(newInput)
    setMentionSearch(null)
    setMentionTargets(parseMentions(newInput))
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus()
        textareaRef.current.style.height = 'auto'
        textareaRef.current.style.height =
          Math.min(textareaRef.current.scrollHeight, 120) + 'px'
      }
    }, 0)
  }

  function removeMentionTarget(agent) {
    // Strip @AGENT from input
    const cleaned = input.replace(new RegExp(`@${agent}\\s?`, 'gi'), '').trim()
    setInput(cleaned)
    setMentionTargets(parseMentions(cleaned))
    textareaRef.current?.focus()
  }

  const MENTION_OPTIONS = ['ALL', ...ALL_MENTIONABLE]
  const filteredAgents = mentionSearch !== null
    ? MENTION_OPTIONS.filter(a => a.startsWith(mentionSearch) || mentionSearch === '')
    : []

  async function handleFiles(fileList) {
    const files = await Promise.all(Array.from(fileList).map(readFile))
    setPendingFiles(prev => {
      const combined = [...prev, ...files]
      return combined.slice(0, 10)
    })
  }

  async function send() {
    const content = input.trim()
    if ((!content && pendingFiles.length === 0) || loading) return

    setInput('')
    setMentionTargets([])
    const filesToSend = [...pendingFiles]
    setPendingFiles([])
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    const attachments = filesToSend.map(f => ({
      name: f.name, type: f.type, size: f.size,
      base64: f.base64 || null, text: f.text || null,
    }))

    const inlineMentions = parseMentions(content)
    const mentionedAll = inlineMentions.includes('ALL')
    let targets
    if (selectedAgent === 'ALL' || mentionedAll) {
      const extra = inlineMentions.filter(a => a !== 'ALL' && !AGENTS.includes(a))
      targets = [...AGENTS, ...extra]
    } else if (inlineMentions.length > 0) {
      targets = inlineMentions
    } else {
      targets = [selectedAgent]
    }

    const senderRole = currentRole === 'vp' ? 'vp' : 'chairman'

    for (const agent of targets) {
      const optimistic = {
        id: `opt-${Date.now()}-${agent}`,
        agent, role: 'chairman',
        source: senderRole === 'vp' ? 'vp' : 'manual',
        _vpName: senderRole === 'vp' ? vpName : undefined,
        content,
        timestamp: new Date().toISOString(),
        _localFiles: filesToSend,
      }
      setMessages(prev => [...prev, optimistic])
      setLoading(true)
      setThinkingAgent(agent)

      try {
        const result = await window.voyaAPI.sendMessage(agent, content, attachments, senderRole)
        const agentMsg = {
          id: `resp-${Date.now()}-${agent}`,
          agent, role: 'agent', content: result.content,
          timestamp: new Date().toISOString(),
        }
        setMessages(prev => [...prev, agentMsg])
        if (result.approvals?.length > 0) onNewApprovals(result.approvals)
      } catch (err) {
        const errMsg = {
          id: `err-${Date.now()}-${agent}`,
          agent, role: 'agent',
          content: `⚠️ ${agent} failed to respond: ${err.message}`,
          timestamp: new Date().toISOString(),
        }
        setMessages(prev => [...prev, errMsg])
      } finally {
        setLoading(false)
        setThinkingAgent(null)
      }
    }
  }

  function handleKey(e) {
    if (mentionSearch !== null && filteredAgents.length > 0) {
      if (e.key === 'Escape') { e.preventDefault(); setMentionSearch(null); return }
      if (e.key === 'Tab') { e.preventDefault(); selectMention(filteredAgents[0]); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  async function takeScreenshot() {
    setScreenshotting(true)
    try {
      const result = await window.voyaAPI.takeScreenshot()
      setToast(`Screenshot saved: ${result.filename}`)
    } catch {
      setToast('Screenshot failed')
    }
    setScreenshotting(false)
  }

  // Group messages by date for dividers
  const grouped = []
  let lastDate = null
  for (const msg of messages) {
    const label = formatDate(msg.timestamp)
    if (label !== lastDate) {
      grouped.push({ type: 'divider', label, key: `div-${msg.id}` })
      lastDate = label
    }
    grouped.push({ type: 'msg', msg, key: msg.id })
  }

  const color = AGENT_COLORS[selectedAgent] || 'var(--text-2)'
  const role = AGENT_ROLES[selectedAgent] || ''

  // Effective routing label
  const mentionedAll = mentionTargets.includes('ALL')
  const routingLabel = (selectedAgent === 'ALL' || mentionedAll)
    ? [...AGENTS, ...mentionTargets.filter(a => a !== 'ALL' && !AGENTS.includes(a))]
    : mentionTargets.length > 0 ? mentionTargets : [selectedAgent]

  return (
    <>
      <div className="panel-header">
        <AgentAvatar agent={selectedAgent} size={30} rounded={8} />
        <div>
          <h2 style={{ color }}>{selectedAgent}</h2>
          <div className="panel-header-sub">{role}</div>
        </div>
        {/* VP mode indicator in header */}
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
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {selectedAgent !== 'ALL' && onEscalateToBoard && (
            <button
              className="btn btn-secondary"
              style={{ fontSize: 11, padding: '4px 10px' }}
              onClick={() => onEscalateToBoard(`${selectedAgent} input on current discussion`)}
              title="Open as board discussion with all agents"
            >
              ↗ Board
            </button>
          )}
          <button
            className="btn btn-secondary"
            style={{ fontSize: 11, padding: '4px 10px', opacity: screenshotting ? 0.5 : 1 }}
            onClick={takeScreenshot}
            disabled={screenshotting}
            title="Save screenshot to Desktop"
          >
            {screenshotting ? '…' : '⌘ Screenshot'}
          </button>
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
        {messages.length === 0 && !loading && (
          <div className="empty-state">
            <div className="empty-state-icon">💬</div>
            <h3>Start a conversation</h3>
            <p>
              {selectedAgent === 'ALL'
                ? 'Broadcasts to all five executives'
                : `Ask ${selectedAgent} anything • use @CPO @CMO etc. to tag agents`}
            </p>
          </div>
        )}

        {grouped.map(item =>
          item.type === 'divider'
            ? <DateDivider key={item.key} label={item.label} />
            : <MessageBubble key={item.key} msg={item.msg} agent={selectedAgent} />
        )}

        {loading && (
          <div className="typing-indicator">
            <AgentAvatar agent={thinkingAgent || selectedAgent} size={22} rounded={5} />
            <div className="typing-dots">
              <div className="typing-dot" />
              <div className="typing-dot" />
              <div className="typing-dot" />
            </div>
            <span>
              {thinkingAgent
                ? `${thinkingAgent} thinking…`
                : selectedAgent === 'ALL' ? 'Agents thinking…' : `${selectedAgent} thinking…`}
            </span>
          </div>
        )}

        <div ref={bottomRef} />

        {toast && <Toast message={toast} onDone={() => setToast(null)} />}
      </div>

      <div className="chat-input-area" ref={inputWrapRef} style={{ position: 'relative' }}>
        {/* @mention autocomplete dropdown */}
        {mentionSearch !== null && filteredAgents.length > 0 && (
          <div style={{
            position: 'absolute', bottom: '100%', left: 20, right: 20,
            background: 'var(--bg-3)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)', overflow: 'hidden',
            boxShadow: '0 -4px 16px rgba(0,0,0,0.4)', zIndex: 20,
            marginBottom: 6,
          }}>
            <div style={{ padding: '6px 10px 4px', fontSize: 10, color: 'var(--text-3)', borderBottom: '1px solid var(--border-subtle)' }}>
              Tag an agent — Tab to select
            </div>
            {filteredAgents.map(agent => (
              <div
                key={agent}
                onMouseDown={e => { e.preventDefault(); selectMention(agent) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-4)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <AgentAvatar agent={agent} size={22} rounded={5} />
                <span style={{ fontSize: 12, fontWeight: 600, color: AGENT_COLORS[agent] }}>@{agent}</span>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{AGENT_ROLES[agent]}</span>
              </div>
            ))}
          </div>
        )}

        {/* Routing chips */}
        {(mentionTargets.length > 0 || selectedAgent === 'ALL') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, color: 'var(--text-3)' }}>Sending to:</span>
            {routingLabel.map(agent => (
              <span
                key={agent}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: `${AGENT_COLORS[agent]}18`,
                  border: `1px solid ${AGENT_COLORS[agent]}44`,
                  color: AGENT_COLORS[agent],
                  fontSize: 10, fontWeight: 700,
                  padding: '2px 7px 2px 5px', borderRadius: 10,
                  cursor: mentionTargets.length > 0 ? 'pointer' : 'default',
                }}
                onClick={() => mentionTargets.length > 0 && removeMentionTarget(agent)}
                title={mentionTargets.length > 0 ? 'Click to remove' : ''}
              >
                <AgentAvatar agent={agent} size={12} rounded={3} />
                {agent}
                {mentionTargets.length > 0 && <span style={{ marginLeft: 1, opacity: 0.6 }}>×</span>}
              </span>
            ))}
          </div>
        )}

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
            placeholder={
              selectedAgent === 'ALL'
                ? 'Message all executives… or @CPO to target one'
                : `Message ${selectedAgent}… or @CMO @CTO to tag others`
            }
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKey}
            disabled={loading}
          />
          <button className="send-btn" onClick={send} disabled={(!input.trim() && pendingFiles.length === 0) || loading}>
            ↑
          </button>
        </div>
        <div style={{ marginTop: 5, fontSize: 10, color: 'var(--text-3)' }}>
          Enter to send · Shift+Enter for newline · @ to tag · 📎 to attach · drag & drop files
        </div>
      </div>
    </>
  )
}
