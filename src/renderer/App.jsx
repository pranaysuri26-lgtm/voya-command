import { useState, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import ChatPanel from './components/ChatPanel'
import ThreadPanel from './components/ThreadPanel'
import DirectPanel from './components/DirectPanel'
import NewThreadModal from './components/NewThreadModal'
import ApprovalInbox from './components/ApprovalInbox'
import DecisionLog from './components/DecisionLog'
import OversightPanel from './components/OversightPanel'
import ChairmanAwayBanner from './components/ChairmanAwayBanner'
import ChairmanAwayModal from './components/ChairmanAwayModal'
import VPSetupModal from './components/VPSetupModal'
import VPModeGate from './components/VPModeGate'
import ReturnSummaryModal from './components/ReturnSummaryModal'
import LoginScreen from './components/LoginScreen'

// ─── Token persistence (localStorage) ───────────────────────────────────────
const TOKEN_KEY = 'voya_auth_token'
const USER_KEY  = 'voya_auth_user'

export default function App() {
  const [authed, setAuthed]   = useState(false)
  const [authUser, setAuthUser] = useState(null)
  const [ready, setReady] = useState(false)
  const [activeView, setActiveView] = useState('chat')
  const [selectedAgent, setSelectedAgent] = useState('COO')
  const [selectedThread, setSelectedThread] = useState(null)
  const [threads, setThreads] = useState([])
  const [unreadThreadIds, setUnreadThreadIds] = useState(new Set())
  const [mentionedThreadIds, setMentionedThreadIds] = useState(new Set())
  const [isNewThreadModalOpen, setIsNewThreadModalOpen] = useState(false)
  const [approvals, setApprovals] = useState([])
  const [rightTab, setRightTab] = useState('inbox')
  const [oversightUnread, setOversightUnread] = useState(false)
  const [activityNotice, setActivityNotice] = useState(null) // high-activity toast
  const [wsConnected, setWsConnected] = useState(true) // WS connection status

  // VP state
  const [currentRole, setCurrentRole] = useState('chairman') // 'chairman' | 'vp'
  const [vpProfile, setVpProfile] = useState(null) // { name, hasPin, badgeColor }
  const [chairmanAway, setChairmanAway] = useState(null) // null or away info object
  const [showVpSetup, setShowVpSetup] = useState(false)
  const [showVpGate, setShowVpGate] = useState(false)
  const [showAwayModal, setShowAwayModal] = useState(false)
  const [returnSummary, setReturnSummary] = useState(null) // summary after chairman returns
  const [showReturnSummary, setShowReturnSummary] = useState(false)

  // VP acting = VP mode is active AND chairman is currently away
  const vpActing = currentRole === 'vp' && chairmanAway?.active

  // ── Auth bootstrap ───────────────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    const user  = localStorage.getItem(USER_KEY)
    if (token && user) {
      try {
        window.voyaAPI.setToken(token)
        const parsed = JSON.parse(user)
        setAuthUser(parsed)
        setAuthed(true)
        // Determine role from stored user
        if (parsed.role === 'vp') setCurrentRole('vp')
      } catch { /* bad storage */ }
    }
  }, [])

  // ── Start app after auth confirmed ───────────────────────────────────────────
  useEffect(() => {
    if (authed) init()
  }, [authed])

  function handleAuth({ token, user }) {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    setAuthUser(user)
    if (user.role === 'vp') setCurrentRole('vp')
    setAuthed(true)
  }

  // Cmd+K to open new thread modal
  useEffect(() => {
    function handler(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsNewThreadModalOpen(true)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  async function init() {
    try {
      const isFirst = await window.voyaAPI.getFirstLaunch()
      const [pendingApprovals, allThreads, vp, away] = await Promise.all([
        window.voyaAPI.getApprovals('inbox'),
        window.voyaAPI.getThreads(),
        window.voyaAPI.getVpProfile(),
        window.voyaAPI.getChairmanAway(),
      ])
      setApprovals(pendingApprovals)
      setThreads(allThreads)
      setVpProfile(vp)
      setChairmanAway(away)

      if (isFirst) {
        await window.voyaAPI.setFirstLaunchDone()
        const result = await window.voyaAPI.triggerWelcome()
        if (result.content) {
          setSelectedAgent('COO')
          setActiveView('chat')
        }
      }

      setReady(true)
      registerListeners()
    } catch (err) {
      // Token expired, server unreachable, or 401 — clear session and show login
      console.warn('[App] init() failed, clearing session:', err.message)
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
      setAuthed(false)
      setReady(false)
    }
  }

  function registerListeners() {
    // ── Keep Railway service awake + track WS connection ──────────────────────
    // Ping /health every 4 min so Railway doesn't sleep the service
    setInterval(() => {
      fetch('/health').catch(() => {})
    }, 4 * 60 * 1000)

    // Monitor WS connect/disconnect to show reconnecting banner
    window.voyaAPI.on('ws-connected',    () => setWsConnected(true))
    window.voyaAPI.on('ws-disconnected', () => setWsConnected(false))

    window.voyaAPI.on('new-approval', (approval) => {
      setApprovals((prev) => {
        if (prev.find((a) => a.id === approval.id)) return prev
        return [{ ...approval, status: 'pending', proposed_at: new Date().toISOString() }, ...prev]
      })
    })

    window.voyaAPI.on('thread-update', (update) => {
      if (update.type === 'message') {
        const isCurrentThread = activeView === 'thread' && selectedThread === update.threadId
        setUnreadThreadIds(prev => {
          if (isCurrentThread) return prev
          const next = new Set(prev)
          next.add(update.threadId)
          return next
        })
        // Check if current user is @mentioned
        const myTag = currentRole === 'vp' ? '@VP' : '@Chairman'
        if (update.content?.includes(myTag) && !isCurrentThread) {
          setMentionedThreadIds(prev => {
            const next = new Set(prev)
            next.add(update.threadId)
            return next
          })
        }
        setOversightUnread(prev => prev || true)
        window.voyaAPI.getThreads().then(setThreads)
      }
    })

    // Agent-proposed thread was approved — refresh threads and navigate
    window.voyaAPI.on('thread-created', ({ thread }) => {
      window.voyaAPI.getThreads().then(setThreads)
      selectThread(thread.id)
    })

    window.voyaAPI.on('briefing-ready', () => {
      window.voyaAPI.getApprovals('inbox').then(setApprovals)
    })

    window.voyaAPI.on('chairman-away-changed', (awayInfo) => {
      setChairmanAway(awayInfo)
    })

    window.voyaAPI.on('threads-updated', () => {
      window.voyaAPI.getThreads().then(setThreads)
    })

    // Another user resolved an approval — sync inbox
    window.voyaAPI.on('approval-resolved', ({ id, status }) => {
      if (status === 'held') {
        setApprovals(prev => prev.map(a => a.id === id ? { ...a, status: 'held' } : a))
      } else {
        setApprovals(prev => prev.filter(a => a.id !== id))
      }
    })

    // Queue high-activity warning
    window.voyaAPI.on('high-activity', ({ message }) => {
      setActivityNotice(message)
      // Auto-dismiss after 8 s
      setTimeout(() => setActivityNotice(null), 8000)
    })
  }

  function handleNewApprovals(newApprovals) {
    setApprovals((prev) => {
      const existing = new Set(prev.map((a) => a.id))
      const fresh = newApprovals.filter((a) => !existing.has(a.id))
      if (fresh.length === 0) return prev
      return [
        ...fresh.map((a) => ({ ...a, status: 'pending', proposed_at: new Date().toISOString() })),
        ...prev,
      ]
    })
  }

  async function handleResolve(id, status, notes) {
    const decidedBy = vpActing ? 'vp_acting' : 'chairman'
    await window.voyaAPI.resolveApproval(id, status, notes, decidedBy)
    if (status === 'held') {
      setApprovals(prev => prev.map(a => a.id === id ? { ...a, status: 'held' } : a))
    } else {
      setApprovals(prev => prev.filter(a => a.id !== id))
    }
  }

  // VP mode handlers
  function handleSwitchToVp() {
    if (!vpProfile?.hasPin) { setShowVpSetup(true); return }
    setShowVpGate(true)
  }

  function handleSwitchToChairman() {
    setCurrentRole('chairman')
  }

  async function handleSetAway(returnDate, note) {
    await window.voyaAPI.setChairmanAway(returnDate, note)
    const updated = await window.voyaAPI.getChairmanAway()
    setChairmanAway(updated)
  }

  async function handleClearAway() {
    const result = await window.voyaAPI.clearChairmanAway()
    setChairmanAway(null)
    setCurrentRole('chairman') // revert to chairman on return
    if (result?.summary) {
      setReturnSummary(result.summary)
      setShowReturnSummary(true)
    }
  }

  function selectAgent(agent) {
    setSelectedAgent(agent)
    setActiveView('chat')
    setSelectedThread(null)
  }

  function selectThread(id) {
    setSelectedThread(id)
    setActiveView('thread')
    setUnreadThreadIds(prev => { const next = new Set(prev); next.delete(id); return next })
    setMentionedThreadIds(prev => { const next = new Set(prev); next.delete(id); return next })
  }

  async function handleThreadCreated(threadId) {
    const allThreads = await window.voyaAPI.getThreads()
    setThreads(allThreads)
    setIsNewThreadModalOpen(false)
    selectThread(threadId)
  }

  async function handleDeleteThread(threadId) {
    await window.voyaAPI.archiveThread(threadId)
    const allThreads = await window.voyaAPI.getThreads()
    setThreads(allThreads)
    setSelectedThread(null)
    setActiveView('chat') // return to default agent chat
  }

  function selectDirect() {
    setActiveView('direct')
    setSelectedThread(null)
  }

  async function escalateToBoard(topic) {
    const result = await window.voyaAPI.startDiscussion(topic)
    // no-op navigation — discussions are legacy
    console.log('Board discussion started:', result.discussionId)
  }

  const pendingCount = approvals.filter((a) => a.status === 'pending').length

  if (!authed) {
    return <LoginScreen onAuth={handleAuth} />
  }

  if (!ready) {
    return (
      <div className="loading-overlay">
        <div className="loading-logo">V</div>
        <div className="loading-text">Starting Voya Command…</div>
      </div>
    )
  }

  return (
    <div className="app" style={{ flexDirection: 'column' }}>

      {/* VP modals */}
      {showVpSetup && (
        <VPSetupModal
          existing={vpProfile}
          onClose={() => setShowVpSetup(false)}
          onSaved={(updated) => { setVpProfile(updated); setShowVpSetup(false) }}
        />
      )}
      {showVpGate && (
        <VPModeGate
          vpName={vpProfile?.name || 'VP'}
          onSuccess={() => { setCurrentRole('vp'); setShowVpGate(false) }}
          onCancel={() => setShowVpGate(false)}
        />
      )}
      {showAwayModal && (
        <ChairmanAwayModal
          currentAway={chairmanAway}
          vpName={vpProfile?.name || 'VP'}
          onActivate={handleSetAway}
          onDeactivate={handleClearAway}
          onClose={() => setShowAwayModal(false)}
        />
      )}
      {showReturnSummary && returnSummary && (
        <ReturnSummaryModal
          summary={returnSummary}
          vpName={vpProfile?.name || 'VP'}
          onClose={() => { setShowReturnSummary(false); setRightTab('log') }}
        />
      )}
      {isNewThreadModalOpen && (
        <NewThreadModal
          onClose={() => setIsNewThreadModalOpen(false)}
          onCreate={handleThreadCreated}
          vpProfile={vpProfile}
          currentRole={currentRole}
        />
      )}

      {/* Reconnecting banner — shown when WS drops */}
      {!wsConnected && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
          background: '#92400e', color: '#fef3c7',
          fontSize: 12, fontWeight: 600, textAlign: 'center',
          padding: '6px 0', letterSpacing: '0.02em',
        }}>
          ⟳ Reconnecting…
        </div>
      )}

      {/* Chairman Away banner — full width, always on top */}
      {chairmanAway?.active && (
        <ChairmanAwayBanner
          awayInfo={chairmanAway}
          vpName={vpProfile?.name || 'VP'}
          onReturn={currentRole === 'chairman' ? () => setShowAwayModal(true) : null}
        />
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

      {/* ── Left sidebar ── */}
      <Sidebar
        activeView={activeView}
        selectedAgent={selectedAgent}
        selectedThread={selectedThread}
        pendingCount={pendingCount}
        threads={threads}
        unreadThreadIds={unreadThreadIds}
        mentionedThreadIds={mentionedThreadIds}
        onSelectAgent={selectAgent}
        onSelectThread={selectThread}
        onNewThread={() => setIsNewThreadModalOpen(true)}
        onSelectDecisions={() => setActiveView('decisions')}
        onSelectDirect={selectDirect}
        currentRole={currentRole}
        vpProfile={vpProfile}
        chairmanAway={chairmanAway}
        onSwitchToVp={handleSwitchToVp}
        onSwitchToChairman={handleSwitchToChairman}
        onOpenVpSetup={() => setShowVpSetup(true)}
        onOpenAwayModal={() => setShowAwayModal(true)}
      />

      {/* ── Main content ── */}
      <div className="main-panel">
        {activeView === 'chat' && (
          <ChatPanel
            selectedAgent={selectedAgent}
            onNewApprovals={handleNewApprovals}
            onEscalateToBoard={escalateToBoard}
            currentRole={currentRole}
            vpActing={vpActing}
            vpName={vpProfile?.name || 'VP'}
            currentUserId={authUser?.id}
          />
        )}
        {activeView === 'thread' && selectedThread && (
          <ThreadPanel
            threadId={selectedThread}
            onNewApprovals={handleNewApprovals}
            onDelete={handleDeleteThread}
            currentRole={currentRole}
            vpActing={vpActing}
            vpName={vpProfile?.name || 'VP'}
          />
        )}
        {activeView === 'thread' && !selectedThread && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 32 }}>💬</div>
            <div style={{ fontSize: 14, color: 'var(--text-2)' }}>Select a thread or create one</div>
            <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setIsNewThreadModalOpen(true)}>
              + New Thread
            </button>
          </div>
        )}
        {activeView === 'direct' && (
          <DirectPanel
            currentRole={currentRole}
            vpName={vpProfile?.name || 'VP'}
          />
        )}
        {activeView === 'decisions' && <DecisionLog />}
      </div>

      {/* ── Right panel ── */}
      <div className="right-panel">
        <div className="right-panel-tabs">
          <button
            className={`right-panel-tab ${rightTab === 'inbox' ? 'active' : ''}`}
            onClick={() => setRightTab('inbox')}
          >
            Inbox
            {pendingCount > 0 && (
              <span style={{
                marginLeft: 5, background: 'var(--danger)', color: '#fff',
                fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 8,
              }}>
                {pendingCount}
              </span>
            )}
          </button>
          <button
            className={`right-panel-tab ${rightTab === 'log' ? 'active' : ''}`}
            onClick={() => setRightTab('log')}
          >
            Log
          </button>
          <button
            className={`right-panel-tab ${rightTab === 'oversight' ? 'active' : ''}`}
            onClick={() => { setRightTab('oversight'); setOversightUnread(false) }}
          >
            Oversight
            {oversightUnread && rightTab !== 'oversight' && (
              <span style={{
                marginLeft: 5, background: 'var(--accent)', color: '#fff',
                fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 8,
              }}>
                ●
              </span>
            )}
          </button>
        </div>
        <div className="right-panel-content">
          {rightTab === 'inbox' && <ApprovalInbox approvals={approvals} onResolve={handleResolve} currentRole={currentRole} vpActing={vpActing} vpName={vpProfile?.name || 'VP'} />}
          {rightTab === 'log' && <RecentDecisions />}
          {rightTab === 'oversight' && <OversightPanel onSelectThread={selectThread} onSelectAgent={selectAgent} />}
        </div>
      </div>

      </div> {/* end flex row */}

      {/* High-activity toast (FIX 1) */}
      {activityNotice && (
        <div style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          background: '#1c1c1e', border: '1px solid #f59e0b66',
          borderRadius: 8, padding: '8px 16px', fontSize: 12,
          color: '#fbbf24', display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)', zIndex: 9999,
          animation: 'fadeIn 0.2s ease',
        }}>
          <span>⏳</span>
          <span>{activityNotice}</span>
          <button
            onClick={() => setActivityNotice(null)}
            style={{ background: 'none', border: 'none', color: '#98989f', cursor: 'pointer', padding: '0 0 0 4px', fontSize: 13 }}
          >✕</button>
        </div>
      )}
    </div>
  )
}

function RecentDecisions() {
  const [decisions, setDecisions] = useState([])

  useEffect(() => {
    window.voyaAPI.getDecisions(null).then((d) => setDecisions(d.slice(0, 20)))
  }, [])

  const AGENT_COLORS = {
    CPO: '#818cf8', CMO: '#f472b6', CTO: '#22d3ee',
    CFO: '#34d399', COO: '#fbbf24', FORGE: '#00BCD4',
  }

  if (decisions.length === 0) {
    return (
      <div className="empty-inbox">
        <div className="empty-inbox-icon">📋</div>
        <div>No decisions yet</div>
      </div>
    )
  }

  return (
    <div>
      {decisions.map((d) => (
        <div key={d.id} className="decision-item">
          <div className="decision-item-header">
            <span style={{ fontSize: 10, fontWeight: 700, color: AGENT_COLORS[d.agent] }}>
              {d.agent}
            </span>
            <span className={`outcome-badge ${d.outcome}`} style={{ marginLeft: 'auto' }}>
              {d.outcome}
            </span>
            {d.decided_by === 'vp_acting' && (
              <span style={{
                fontSize: 9, fontWeight: 700, background: '#f59e0b22',
                border: '1px solid #f59e0b44', color: '#fbbf24',
                borderRadius: 4, padding: '1px 5px', marginLeft: 4,
              }}>VP ACTING</span>
            )}
          </div>
          <div className="decision-item-title">{d.title}</div>
          <div className="decision-item-desc">{d.description}</div>
          <div className="decision-item-meta">
            {new Date(d.decided_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
          </div>
        </div>
      ))}
    </div>
  )
}
