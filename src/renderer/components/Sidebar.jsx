import AgentAvatar from './AgentAvatar'
import { useState } from 'react'

const CSUITE = ['CPO', 'CMO', 'CTO', 'CFO', 'COO']

const AGENT_ROLES = {
  CPO: 'Product', CMO: 'Marketing', CTO: 'Technology',
  CFO: 'Finance', COO: 'Operations',
}

const AGENT_COLORS = {
  CPO: '#818cf8', CMO: '#f472b6', CTO: '#22d3ee',
  CFO: '#34d399', COO: '#fbbf24',
}

function MemberDots({ members, max = 4 }) {
  const shown = members.slice(0, max)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      {shown.map(agent => (
        <div
          key={agent}
          title={agent}
          style={{
            width: 7, height: 7, borderRadius: '50%',
            background: AGENT_COLORS[agent] || 'var(--text-3)',
            flexShrink: 0,
          }}
        />
      ))}
      {members.length > max && (
        <span style={{ fontSize: 9, color: 'var(--text-3)' }}>+{members.length - max}</span>
      )}
    </div>
  )
}

export default function Sidebar({
  onSelectTasks,
  onSelectBrief,
  activeView,
  selectedAgent,
  selectedThread,
  pendingCount,
  threads,
  archivedThreads = [],
  unreadThreadIds,
  mentionedThreadIds = new Set(),
  onSelectAgent,
  onSelectThread,
  onNewThread,
  onSelectDecisions,
  onSelectDirect,
  onUnarchiveThread,
  onLogout,
  currentRole = 'chairman',
  vpProfile = null,
  chairmanAway = null,
  onSwitchToVp,
  onSwitchToChairman,
  onOpenVpSetup,
  onOpenAwayModal,
  onReviewApp,
  onBoardBrief,
}) {
  const [archivedExpanded, setArchivedExpanded] = useState(false)
  const isVp = currentRole === 'vp'
  const vpActing = isVp && chairmanAway?.active
  const vpName = vpProfile?.name || 'VP'
  return (
    <div className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">V</div>
        <div>
          <div className="sidebar-logo-text">Voya Command</div>
          <div className="sidebar-logo-sub">Executive Suite</div>
        </div>
      </div>

      {/* ── Agents ── */}
      <div className="sidebar-section">
        <div className="sidebar-section-label">Agents</div>

        <div
          className={`sidebar-item ${activeView === 'chat' && selectedAgent === 'ALL' ? 'active' : ''}`}
          onClick={() => onSelectAgent('ALL')}
        >
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#6366f1', flexShrink: 0 }} />
          <div className="sidebar-item-label">
            <div>All Agents</div>
            <div className="sidebar-item-sub">Broadcast</div>
          </div>
        </div>

        {CSUITE.map((agent) => (
          <div key={agent}>
            <div
              className={`sidebar-item ${activeView === 'chat' && selectedAgent === agent ? 'active' : ''}`}
              onClick={() => onSelectAgent(agent)}
            >
              <div className="agent-dot" style={{ background: AGENT_COLORS[agent] }} />
              <div className="sidebar-item-label">
                <div>{agent}</div>
                <div className="sidebar-item-sub">{AGENT_ROLES[agent]}</div>
              </div>
            </div>

          </div>
        ))}
      </div>

      <div className="sidebar-divider" />

      {/* ── Threads ── */}
      <div className="sidebar-section">
        <div className="sidebar-section-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Threads</span>
          <button
            onClick={onNewThread}
            title="New Thread (⌘K)"
            style={{
              background: 'none', border: 'none', color: 'var(--text-3)',
              fontSize: 16, lineHeight: 1, cursor: 'pointer', padding: '0 2px',
              display: 'flex', alignItems: 'center',
            }}
          >
            +
          </button>
        </div>
      </div>

      <div className="sidebar-threads">
        {threads.map((t) => {
          const isActive = activeView === 'thread' && selectedThread === t.id
          const hasUnread = unreadThreadIds.has(t.id)
          const hasMention = mentionedThreadIds.has(t.id)
          return (
            <div
              key={t.id}
              className={`thread-list-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelectThread(t.id)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                {t.pinned ? (
                  <span style={{ fontSize: 9, color: 'var(--text-3)' }}>📌</span>
                ) : null}
                <span className="thread-list-item-name">{t.name}</span>
                {hasMention && (
                  <span style={{
                    fontSize: 9, fontWeight: 800, color: '#fff',
                    background: 'var(--accent)', borderRadius: 4,
                    padding: '0px 4px', lineHeight: '14px',
                  }}>@</span>
                )}
                {hasUnread && !hasMention && <div className="thread-unread-dot" />}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <MemberDots members={t.members} />
                {t.lastMessage && (
                  <span className="thread-list-item-preview">
                    {t.lastMessage.sender === 'chairman' ? 'You' : t.lastMessage.sender}:&nbsp;
                    {t.lastMessage.content.slice(0, 35)}{t.lastMessage.content.length > 35 ? '…' : ''}
                  </span>
                )}
              </div>
            </div>
          )
        })}

        {threads.length === 0 && (
          <div
            className="thread-list-item"
            onClick={onNewThread}
            style={{ cursor: 'pointer', opacity: 0.6 }}
          >
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>+ Create your first thread</span>
          </div>
        )}
      </div>

      {/* ── Archived Threads ── */}
      {archivedThreads.length > 0 && (
        <>
          <div
            className="sidebar-section"
            style={{ cursor: 'pointer', userSelect: 'none' }}
            onClick={() => setArchivedExpanded(v => !v)}
          >
            <div className="sidebar-section-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ opacity: 0.6 }}>Archived</span>
              <span style={{ fontSize: 9, color: 'var(--text-3)', opacity: 0.6 }}>
                {archivedExpanded ? '▲' : '▼'} {archivedThreads.length}
              </span>
            </div>
          </div>
          {archivedExpanded && (
            <div className="sidebar-threads" style={{ opacity: 0.7 }}>
              {archivedThreads.map((t) => (
                <div
                  key={t.id}
                  className="thread-list-item"
                  style={{ cursor: 'default' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <span className="thread-list-item-name" style={{ opacity: 0.7 }}>{t.name}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onUnarchiveThread && onUnarchiveThread(t.id) }}
                      title="Restore thread"
                      style={{
                        background: 'none', border: '1px solid var(--border)',
                        borderRadius: 4, color: 'var(--text-3)',
                        fontSize: 9, padding: '1px 5px', cursor: 'pointer',
                        flexShrink: 0, lineHeight: '14px',
                      }}
                    >
                      Restore
                    </button>
                  </div>
                  {t.members?.length > 0 && <MemberDots members={t.members} />}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="sidebar-divider" />

      {/* ── Direct Messages ── */}
      <div className="sidebar-section">
        <div className="sidebar-section-label">Direct</div>
        <div
          className={`sidebar-item ${activeView === 'direct' ? 'active' : ''}`}
          onClick={onSelectDirect}
        >
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#94A3B8', flexShrink: 0 }} />
          <div className="sidebar-item-label">
            <div>{isVp ? 'Chairman' : (vpProfile?.name || 'VP')}</div>
            <div className="sidebar-item-sub">Private message</div>
          </div>
        </div>
      </div>

      <div className="sidebar-divider" />

      <div style={{ paddingBottom: 4 }}>
        <div
          className={`sidebar-item ${activeView === 'brief' ? 'active' : ''}`}
          onClick={onSelectBrief}
        >
          <span style={{ color: 'var(--text-3)', fontSize: 13 }}>☀</span>
          <div className="sidebar-item-label">Morning Brief</div>
        </div>
        <div
          className={`sidebar-item ${activeView === 'tasks' ? 'active' : ''}`}
          onClick={onSelectTasks}
        >
          <span style={{ color: 'var(--text-3)', fontSize: 13 }}>☑</span>
          <div className="sidebar-item-label">Tasks</div>
        </div>
        <div
          className={`sidebar-item ${activeView === 'decisions' ? 'active' : ''}`}
          onClick={onSelectDecisions}
        >
          <span style={{ color: 'var(--text-3)', fontSize: 13 }}>▤</span>
          <div className="sidebar-item-label">Decision Log</div>
        </div>
      </div>

      <div className="sidebar-divider" />

      {/* ── Role switcher ── */}
      <div style={{ padding: '8px 10px 12px' }}>
        {/* Current identity badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 8px', borderRadius: 8,
          background: isVp
            ? (vpActing ? '#78350f22' : '#94A3B811')
            : 'transparent',
          border: isVp
            ? (vpActing ? '1px solid #f59e0b33' : '1px solid #94A3B833')
            : '1px solid transparent',
          marginBottom: 6,
        }}>
          <div style={{
            width: 24, height: 24, borderRadius: 6, flexShrink: 0,
            background: isVp ? '#94A3B822' : 'var(--accent)22',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `1px solid ${isVp ? '#94A3B844' : 'var(--accent)44'}`,
          }}>
            <span style={{ fontSize: 9, fontWeight: 800, color: isVp ? '#94A3B8' : 'var(--accent)' }}>
              {isVp ? 'VP' : 'CH'}
            </span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-1)' }}>
              {isVp ? vpName : 'Chairman'}
            </div>
            <div style={{ fontSize: 9, color: isVp ? '#94A3B8' : 'var(--text-3)' }}>
              {vpActing ? '● Acting — full authority' : isVp ? 'Normal mode' : 'Full authority'}
            </div>
          </div>
        </div>

        {/* VP cannot switch to Chairman — separate accounts */}

        {/* Review App */}
        {onReviewApp && (
          <button
            onClick={onReviewApp}
            style={{
              width: '100%',
              background: activeView === 'review' ? 'var(--accent)22' : 'none',
              border: `1px solid ${activeView === 'review' ? 'var(--accent)88' : 'var(--accent)44'}`,
              borderRadius: 6, color: 'var(--accent)', fontSize: 10,
              fontWeight: 600, padding: '5px 0', cursor: 'pointer',
              letterSpacing: '0.04em', marginBottom: 4,
              transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)22'; e.currentTarget.style.borderColor = 'var(--accent)88' }}
            onMouseLeave={e => {
              e.currentTarget.style.background = activeView === 'review' ? 'var(--accent)22' : 'none'
              e.currentTarget.style.borderColor = activeView === 'review' ? 'var(--accent)88' : 'var(--accent)44'
            }}
          >
            🔍 Review App
          </button>
        )}

        {/* Board Brief */}
        {onBoardBrief && (
          <button
            onClick={onBoardBrief}
            style={{
              width: '100%',
              background: activeView === 'brief-panel' ? '#f4724222' : 'none',
              border: `1px solid ${activeView === 'brief-panel' ? '#f4724288' : '#f4724244'}`,
              borderRadius: 6, color: '#f47242', fontSize: 10,
              fontWeight: 600, padding: '5px 0', cursor: 'pointer',
              letterSpacing: '0.04em', marginBottom: 4,
              transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#f4724222'; e.currentTarget.style.borderColor = '#f4724288' }}
            onMouseLeave={e => {
              e.currentTarget.style.background = activeView === 'brief-panel' ? '#f4724222' : 'none'
              e.currentTarget.style.borderColor = activeView === 'brief-panel' ? '#f4724288' : '#f4724244'
            }}
          >
            📋 Board Brief
          </button>
        )}

        {/* Logout */}
        <button
          onClick={onLogout}
          style={{
            width: '100%', background: 'none', border: '1px solid var(--border)',
            borderRadius: 6, color: 'var(--text-3)', fontSize: 10,
            fontWeight: 600, padding: '5px 0', cursor: 'pointer',
            letterSpacing: '0.04em', marginTop: 2,
            transition: 'color 0.15s, border-color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.borderColor = '#f8717155' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.borderColor = 'var(--border)' }}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
