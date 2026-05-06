import { useState, useEffect, useRef } from 'react'

const AGENTS = ['CPO', 'CMO', 'CTO', 'CFO', 'COO']

const AGENT_META = {
  CPO: { label: 'Chief Product Officer',   emoji: '🎯', color: '#818cf8' },
  CMO: { label: 'Chief Marketing Officer', emoji: '📣', color: '#f472b6' },
  CTO: { label: 'Chief Technology Officer',emoji: '⚙️',  color: '#22d3ee' },
  CFO: { label: 'Chief Financial Officer', emoji: '💰', color: '#34d399' },
  COO: { label: 'Chief Operating Officer', emoji: '🗂️', color: '#fbbf24' },
}

// ─── Copy button ──────────────────────────────────────────────────────────────
function CopyButton({ text, color }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button onClick={handleCopy} title="Copy response" style={{
      background: copied ? color + '22' : 'none',
      border: `1px solid ${copied ? color + '66' : 'var(--border)'}`,
      borderRadius: 5, padding: '3px 8px',
      cursor: 'pointer', fontSize: 10, fontWeight: 600,
      color: copied ? color : 'var(--text-3)',
      letterSpacing: '0.04em', transition: 'all 0.15s', flexShrink: 0,
    }}>
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  )
}

function CopyAllButton({ onCopy }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() { onCopy(); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  return (
    <button onClick={handleCopy} style={{
      background: copied ? '#ffffff11' : 'none',
      border: '1px solid var(--border)', borderRadius: 6,
      padding: '5px 10px', cursor: 'pointer', fontSize: 10, fontWeight: 600,
      color: copied ? 'var(--text-1)' : 'var(--text-3)',
      letterSpacing: '0.04em', transition: 'all 0.15s',
    }}>
      {copied ? '✓ All copied' : 'Copy all'}
    </button>
  )
}

// ─── Agent card ───────────────────────────────────────────────────────────────
function AgentCard({ agent, status, content }) {
  const meta      = AGENT_META[agent]
  const isPending = status === 'pending'
  const isThinking= status === 'thinking'
  const isDone    = status === 'done'

  return (
    <div style={{
      border: `1px solid ${isDone ? meta.color + '33' : 'var(--border)'}`,
      borderRadius: 12,
      background: isDone ? meta.color + '08' : 'var(--bg-2)',
      padding: '16px 20px',
      transition: 'border-color 0.3s, background 0.3s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: isDone ? 14 : 0 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: meta.color + '22', border: `1px solid ${meta.color}44`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
        }}>
          {meta.emoji}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{agent}</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{meta.label}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isDone && content && (
            <CopyButton text={`${agent} — ${meta.label}\n\n${content}`} color={meta.color} />
          )}
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em' }}>
            {isPending  && <span style={{ color: 'var(--text-3)' }}>WAITING</span>}
            {isThinking && (
              <span style={{ color: meta.color }}>
                THINKING<span style={{ display: 'inline-block', animation: 'ellipsis 1.4s steps(4,end) infinite' }}>...</span>
              </span>
            )}
            {isDone && <span style={{ color: meta.color }}>DONE ✓</span>}
          </div>
        </div>
      </div>

      {isDone && content && (
        <div style={{
          fontSize: 12, lineHeight: 1.7, color: 'var(--text-2)',
          whiteSpace: 'pre-wrap',
          borderTop: `1px solid ${meta.color}22`,
          paddingTop: 12, marginTop: 4,
        }}>
          {content}
        </div>
      )}

      {isThinking && (
        <div style={{ marginTop: 12 }}>
          {[80, 60, 70].map((w, i) => (
            <div key={i} style={{
              height: 9, borderRadius: 4, background: 'var(--border)',
              width: `${w}%`, marginBottom: 6, opacity: 0.5,
              animation: `pulse 1.5s ease-in-out ${i * 0.2}s infinite`,
            }} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Idle placeholder ─────────────────────────────────────────────────────────
function IdlePlaceholder({ mode, onStart }) {
  const isReview = mode === 'review'
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 12, color: 'var(--text-3)', textAlign: 'center', padding: '0 24px',
    }}>
      <div style={{ fontSize: 32 }}>{isReview ? '🏢' : '📋'}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
        {isReview ? 'Board App Review' : 'Weekly Board Brief'}
      </div>
      <div style={{ fontSize: 11, maxWidth: 280, lineHeight: 1.6 }}>
        {isReview
          ? 'All 5 executives review getvoya.net from their domain lens and post findings here.'
          : 'Each executive surfaces the ONE risk in their domain they haven\'t been asked about. No updates — only concerns.'}
      </div>
      <button onClick={onStart} style={{
        marginTop: 8, background: 'var(--accent)', color: '#fff',
        border: 'none', borderRadius: 8, padding: '9px 20px',
        fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em',
      }}>
        {isReview ? 'Start Review' : 'Run Board Brief'}
      </button>
    </div>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────
export default function ReviewPanel({ initialMode = 'review' }) {
  const [mode, setMode]         = useState(initialMode)  // 'review' | 'brief'
  const [phase, setPhase]       = useState('idle')    // idle | running | done
  const [agentStatus, setAgentStatus]   = useState(Object.fromEntries(AGENTS.map(a => [a, 'pending'])))
  const [agentContent, setAgentContent] = useState({})
  const bottomRef = useRef(null)

  // Switch mode resets to idle
  function switchMode(m) {
    if (m === mode) return
    setMode(m)
    setPhase('idle')
    setAgentStatus(Object.fromEntries(AGENTS.map(a => [a, 'pending'])))
    setAgentContent({})
  }

  useEffect(() => {
    const startEvt   = mode === 'review' ? 'review-started'        : 'brief-started'
    const thinkEvt   = mode === 'review' ? 'review-agent-thinking' : 'brief-agent-thinking'
    const completeEvt= mode === 'review' ? 'review-complete'       : 'brief-complete'
    const msgSource  = mode === 'review' ? 'review'                : 'brief'

    const unsubs = []

    unsubs.push(window.voyaAPI.on(startEvt, () => {
      setPhase('running')
      setAgentStatus(Object.fromEntries(AGENTS.map(a => [a, 'pending'])))
      setAgentContent({})
    }))

    unsubs.push(window.voyaAPI.on(thinkEvt, ({ agent }) => {
      setAgentStatus(prev => ({ ...prev, [agent]: 'thinking' }))
    }))

    unsubs.push(window.voyaAPI.on('agent-message', (payload) => {
      if (payload.source !== msgSource) return
      const agent = payload.agent
      if (!agent) return
      setAgentContent(prev => ({ ...prev, [agent]: payload.content }))
      setAgentStatus(prev => ({ ...prev, [agent]: 'done' }))
    }))

    unsubs.push(window.voyaAPI.on(completeEvt, () => setPhase('done')))

    return () => unsubs.forEach(fn => fn())
  }, [mode])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [agentContent])

  async function startAction() {
    setPhase('running')
    setAgentStatus(Object.fromEntries(AGENTS.map(a => [a, 'pending'])))
    setAgentContent({})
    try {
      if (mode === 'review') await window.voyaAPI.reviewApp()
      else                   await window.voyaAPI.boardBrief()
    } catch (err) {
      console.error('[ReviewPanel] failed:', err)
      setPhase('idle')
    }
  }

  function copyAll() {
    const text = AGENTS
      .filter(a => agentContent[a])
      .map(a => `=== ${a} — ${AGENT_META[a].label} ===\n\n${agentContent[a]}`)
      .join('\n\n\n')
    navigator.clipboard.writeText(text)
  }

  const doneCount = Object.values(agentStatus).filter(s => s === 'done').length
  const isReview  = mode === 'review'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-1)' }}>

      {/* ── Header ── */}
      <div style={{
        padding: '16px 24px 0',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        {/* Tab bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 2 }}>
            {[
              { key: 'review', label: '🔍 App Review' },
              { key: 'brief',  label: '📋 Board Brief' },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => switchMode(key)} style={{
                background: mode === key ? 'var(--accent)22' : 'none',
                border: `1px solid ${mode === key ? 'var(--accent)66' : 'transparent'}`,
                borderRadius: 6, padding: '5px 10px',
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                color: mode === key ? 'var(--accent)' : 'var(--text-3)',
                letterSpacing: '0.03em', transition: 'all 0.15s',
              }}>
                {label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {phase === 'done' && doneCount > 0 && <CopyAllButton onCopy={copyAll} />}
            {(phase === 'idle' || phase === 'done') && (
              <button onClick={startAction} style={{
                background: 'var(--accent)', color: '#fff',
                border: 'none', borderRadius: 8, padding: '6px 13px',
                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                letterSpacing: '0.04em', transition: 'opacity 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                {phase === 'done'
                  ? (isReview ? '↺ Re-review' : '↺ Re-run')
                  : (isReview ? 'Start Review' : 'Run Brief')}
              </button>
            )}
            {phase === 'running' && (
              <div style={{
                fontSize: 10, color: 'var(--accent)', fontWeight: 700,
                letterSpacing: '0.06em', animation: 'pulse 1.5s ease-in-out infinite',
              }}>LIVE</div>
            )}
          </div>
        </div>

        {/* Status line */}
        <div style={{ fontSize: 11, color: 'var(--text-3)', paddingBottom: 10 }}>
          {phase === 'idle'    && (isReview ? 'All 5 board members review getvoya.net' : 'Each executive surfaces one unprompted concern')}
          {phase === 'running' && `${isReview ? 'Reviewing' : 'Briefing'}… ${doneCount}/5 agents done`}
          {phase === 'done'    && `${isReview ? 'Review' : 'Brief'} complete — ${doneCount}/5 responses`}
        </div>
      </div>

      {/* ── Cards ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {phase === 'idle' ? (
          <IdlePlaceholder mode={mode} onStart={startAction} />
        ) : (
          <>
            {AGENTS.map(agent => (
              <AgentCard
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
        @keyframes ellipsis { 0%{content:''} 25%{content:'.'} 50%{content:'..'} 75%{content:'...'} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </div>
  )
}
