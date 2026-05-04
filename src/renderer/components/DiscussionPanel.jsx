import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import AgentAvatar from './AgentAvatar'

const AGENT_COLORS = {
  CPO: '#818cf8',
  CMO: '#f472b6',
  CTO: '#22d3ee',
  CFO: '#34d399',
  COO: '#fbbf24',
  FORGE: '#00BCD4',
}

const AGENT_ROLES = {
  CPO: 'Chief Product Officer',
  CMO: 'Chief Marketing Officer',
  CTO: 'Chief Technology Officer',
  CFO: 'Chief Financial Officer',
  COO: 'Chief Operating Officer',
}

function formatTime(ts) {
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function DiscussionView({ discussionId, liveUpdates, typingAgent, onNewApprovals }) {
  const [discussion, setDiscussion] = useState(null)
  const [messages, setMessages] = useState([])
  const bottomRef = useRef(null)

  useEffect(() => {
    load()
  }, [discussionId])

  useEffect(() => {
    // Merge live updates into messages
    if (liveUpdates) {
      setMessages((prev) => {
        const existing = new Set(prev.map((m) => m.id))
        const news = liveUpdates.filter((m) => !existing.has(m.id))
        return [...prev, ...news]
      })
    }
  }, [liveUpdates])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typingAgent])

  async function load() {
    const { discussion: d, messages: msgs } = await window.voyaAPI.getDiscussionMessages(discussionId)
    setDiscussion(d)
    setMessages(msgs)
  }

  if (!discussion) {
    return (
      <div className="empty-state" style={{ flex: 1 }}>
        <div className="typing-dots">
          <div className="typing-dot" />
          <div className="typing-dot" />
          <div className="typing-dot" />
        </div>
      </div>
    )
  }

  const participants = (() => {
    try { return JSON.parse(discussion.participants || '[]') } catch { return [] }
  })()

  const RECOMMENDATION_RE = /\[RECOMMENDATION READY\]/

  return (
    <>
      <div className="panel-header">
        <span style={{ fontSize: 18, opacity: 0.6 }}>🗣</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: 14 }}>{discussion.topic}</h2>
          <div className="panel-header-sub">
            {discussion.status === 'closed' ? 'Archived · ' : 'Active · '}
            {participants.length > 0 ? participants.join(', ') : 'All agents'}
          </div>
        </div>
        {participants.length > 0 && (
          <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
            {participants.map(a => <AgentAvatar key={a} agent={a} size={22} rounded={5} />)}
          </div>
        )}
      </div>

      <div className="discussion-feed">
        {messages.map((msg, i) => {
          const isRecommendation = RECOMMENDATION_RE.test(msg.content)
          const cleanContent = msg.content.replace(/\[RECOMMENDATION READY\]/g, '').trim()
          return (
            <div key={msg.id || i} className={`discussion-msg ${isRecommendation ? 'summary' : ''}`}>
              <AgentAvatar agent={msg.agent} size={30} rounded={8} />
              <div className="discussion-msg-body">
                <div className="discussion-msg-header">
                  <span
                    className="discussion-msg-agent"
                    style={{ color: AGENT_COLORS[msg.agent] }}
                  >
                    {msg.agent}
                  </span>
                  <span className="discussion-msg-role">{AGENT_ROLES[msg.agent]}</span>
                  {msg.timestamp && (
                    <span className="discussion-msg-time">{formatTime(msg.timestamp)}</span>
                  )}
                </div>
                <div className="discussion-msg-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanContent}</ReactMarkdown>
                </div>
                {isRecommendation && (
                  <div style={{
                    marginTop: 8, padding: '6px 10px',
                    background: 'var(--success-dim)', border: '1px solid var(--success)',
                    borderRadius: 'var(--radius-sm)', fontSize: 11,
                    color: 'var(--success)', fontWeight: 600,
                  }}>
                    ✓ Recommendation ready — check Approval Inbox to action it
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {typingAgent && (
          <div className="typing-agent">
            <AgentAvatar agent={typingAgent} size={22} rounded={5} />
            <div className="typing-dots">
              <div className="typing-dot" />
              <div className="typing-dot" />
              <div className="typing-dot" />
            </div>
            <span style={{ marginLeft: 4 }}>{typingAgent} is thinking…</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </>
  )
}

export default function DiscussionPanel({
  selectedDiscussion,
  liveUpdates,
  typingAgent,
  onSelectDiscussion,
  onNewApprovals,
}) {
  const [topic, setTopic] = useState('')
  const [starting, setStarting] = useState(false)

  async function startDiscussion() {
    const t = topic.trim()
    if (!t || starting) return
    setStarting(true)
    setTopic('')
    // participants=undefined → main process uses selectParticipants(topic)
    const result = await window.voyaAPI.startDiscussion(t)
    onSelectDiscussion(result.discussionId)
    setStarting(false)
  }

  function handleKey(e) {
    if (e.key === 'Enter') startDiscussion()
  }

  if (selectedDiscussion) {
    return (
      <>
        <DiscussionView
          discussionId={selectedDiscussion}
          liveUpdates={liveUpdates[selectedDiscussion]}
          typingAgent={typingAgent === selectedDiscussion ? typingAgent : null}
          onNewApprovals={onNewApprovals}
        />
        <div className="discussion-input-area">
          <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center' }}>
            Start a new discussion from the sidebar
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="panel-header">
        <span style={{ fontSize: 18, opacity: 0.6 }}>🗣</span>
        <div>
          <h2>Agent Discussion</h2>
          <div className="panel-header-sub">All five executives deliberate</div>
        </div>
      </div>

      <div className="empty-state" style={{ flex: 1 }}>
        <div className="empty-state-icon">🗣</div>
        <h3>Start a discussion</h3>
        <p>All five agents deliberate, then COO surfaces a recommendation</p>
      </div>

      <div className="discussion-input-area">
        <div className="new-discussion-wrap">
          <input
            className="new-discussion-input"
            placeholder="Pose a question to the executive team…"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={handleKey}
            disabled={starting}
          />
          <button
            className="btn btn-primary"
            onClick={startDiscussion}
            disabled={!topic.trim() || starting}
            style={{ whiteSpace: 'nowrap' }}
          >
            {starting ? '…' : 'Convene'}
          </button>
        </div>
      </div>
    </>
  )
}
