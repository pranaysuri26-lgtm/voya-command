import { useState, useEffect, useRef } from 'react'

const AGENTS = ['CPO', 'CMO', 'CTO', 'CFO', 'COO']

const AGENT_META = {
  CPO: { label: 'Chief Product Officer',  emoji: '🎯', color: '#818cf8' },
  CMO: { label: 'Chief Marketing Officer', emoji: '📣', color: '#f472b6' },
  CTO: { label: 'Chief Technology Officer',emoji: '⚙️',  color: '#34d399' },
  CFO: { label: 'Chief Financial Officer', emoji: '💰', color: '#fbbf24' },
  COO: { label: 'Chief Operating Officer', emoji: '🗂️',  color: '#60a5fa' },
}

function AgentReviewCard({ agent, status, content }) {
  const meta = AGENT_META[agent]
  const isPending   = status === 'pending'
  const isThinking  = status === 'thinking'
  const isDone      = status === 'done'

  return (
    <div style={{
      border: `1px solid ${isDone ? meta.color + '33' : 'var(--border)'}`,
      borderRadius: 12,
      background: isDone ? meta.color + '08' : 'var(--bg-2)',
      padding: '16px 20px',
      transition: 'border-color 0.3s, background 0.3s',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: isDone ? 14 : 0 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: meta.color + '22',
          border: `1px solid ${meta.color}44`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15,
        }}>
          {meta.emoji}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{agent}</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{meta.label}</div>
        </div>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em' }}>
          {isPending  && <span style={{ color: 'var(--text-3)' }}>WAITING</span>}
          {isThinking && (
            <span style={{ color: meta.color }}>
              THINKING
              <span style={{ display: 'inline-block', animation: 'ellipsis 1.4s steps(4, end) infinite' }}>...</span>
            </span>
          )}
          {isDone && <span style={{ color: meta.color }}>DONE ✓</span>}
        </div>
      </div>

      {/* Content */}
      {isDone && content && (
        <div style={{
          fontSize: 12, lineHeight: 1.7, color: 'var(--text-2)',
          whiteSpace: 'pre-wrap',
          borderTop: `1px solid ${meta.color}22`,
          paddingTop: 12,
          marginTop: 4,
        }}>
          {content}
        </div>
      )}

      {/* Thinking shimmer */}
      {isThinking && (
        <div style={{ marginTop: 12 }}>
          {[80, 60, 70].map((w, i) => (
            <div key={i} style={{
              height: 9, borderRadius: 4, background: 'var(--border)',
              width: `${w}%`, marginBottom: 6,
              opacity: 0.5,
              animation: `pulse 1.5s ease-in-out ${i * 0.2}s infinite`,
            }} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function ReviewPanel({ onTriggerReview }) {
  const [phase, setPhase]       = useState('idle')   // idle | running | done
  const [agentStatus, setAgentStatus] = useState(
    Object.fromEntries(AGENTS.map(a => [a, 'pending']))
  )
  const [agentContent, setAgentContent] = useState({})
  const bottomRef = useRef(null)

  useEffect(() => {
    const unsubs = []

    unsubs.push(window.voyaAPI.on('review-started', () => {
      setPhase('running')
      setAgentStatus(Object.fromEntries(AGENTS.map(a => [a, 'pending'])))
      setAgentContent({})
    }))

    unsubs.push(window.voyaAPI.on('review-agent-thinking', ({ agent }) => {
      setAgentStatus(prev => ({ ...prev, [agent]: 'thinking' }))
    }))

    // agent-message with source:'review' carries the finished review
    unsubs.push(window.voyaAPI.on('agent-message', (payload) => {
      if (payload.source !== 'review') return
      const agent = payload.agent
      if (!agent) return
      setAgentContent(prev => ({ ...prev, [agent]: payload.content }))
      setAgentStatus(prev => ({ ...prev, [agent]: 'done' }))
    }))

    unsubs.push(window.voyaAPI.on('review-complete', () => {
      setPhase('done')
    }))

    return () => unsubs.forEach(fn => fn())
  }, [])

  // Scroll to bottom as reviews come in
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [agentContent])

  async function startReview() {
    setPhase('running')
    setAgentStatus(Object.fromEntries(AGENTS.map(a => [a, 'pending'])))
    setAgentContent({})
    try {
      await window.voyaAPI.reviewApp()
    } catch (err) {
      console.error('[ReviewPanel] failed:', err)
      setPhase('idle')
    }
  }

  const doneCount = Object.values(agentStatus).filter(s => s === 'done').length

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg-1)',
    }}>
      {/* ── Header ── */}
      <div style={{
        padding: '18px 24px 14px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', marginBottom: 2 }}>
            🔍 App Review
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
            {phase === 'idle'    && 'All 5 board members review getvoya.net'}
            {phase === 'running' && `Reviewing… ${doneCount}/5 agents done`}
            {phase === 'done'    && `Review complete — ${doneCount}/5 responses`}
          </div>
        </div>
        {(phase === 'idle' || phase === 'done') && (
          <button
            onClick={startReview}
            style={{
              background: 'var(--accent)', color: '#fff',
              border: 'none', borderRadius: 8,
              padding: '7px 14px', fontSize: 11, fontWeight: 700,
              cursor: 'pointer', letterSpacing: '0.04em',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            {phase === 'done' ? '↺ Re-review' : 'Start Review'}
          </button>
        )}
        {phase === 'running' && (
          <div style={{
            fontSize: 10, color: 'var(--accent)', fontWeight: 700,
            letterSpacing: '0.06em',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}>
            LIVE
          </div>
        )}
      </div>

      {/* ── Cards ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {phase === 'idle' ? (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 12,
            color: 'var(--text-3)', textAlign: 'center',
          }}>
            <div style={{ fontSize: 32 }}>🏢</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>Board Review</div>
            <div style={{ fontSize: 11, maxWidth: 280, lineHeight: 1.6 }}>
              All 5 agents (CPO, CMO, CTO, CFO, COO) will each review getvoya.net from their lens and post their findings here.
            </div>
            <button
              onClick={startReview}
              style={{
                marginTop: 8,
                background: 'var(--accent)', color: '#fff',
                border: 'none', borderRadius: 8,
                padding: '9px 20px', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', letterSpacing: '0.04em',
              }}
            >
              Start Review
            </button>
          </div>
        ) : (
          <>
            {AGENTS.map(agent => (
              <AgentReviewCard
                key={agent}
                agent={agent}
                status={agentStatus[agent]}
                content={agentContent[agent]}
              />
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      <style>{`
        @keyframes ellipsis {
          0%   { content: ''; }
          25%  { content: '.'; }
          50%  { content: '..'; }
          75%  { content: '...'; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
