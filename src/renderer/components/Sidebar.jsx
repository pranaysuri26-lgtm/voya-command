import AgentAvatar from './AgentAvatar'

const CSUITE = ['CPO', 'CMO', 'CTO', 'CFO', 'COO']

const AGENT_ROLES = {
  CPO: 'Product', CMO: 'Marketing', CTO: 'Technology',
  CFO: 'Finance', COO: 'Operations', FORGE: 'AI Developer',
}

const AGENT_COLORS = {
  CPO: '#818cf8', CMO: '#f472b6', CTO: '#22d3ee',
  CFO: '#34d399', COO: '#fbbf24', FORGE: '#00BCD4',
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
  activeView,
  selectedAgent,
  selectedThread,
  pendingCount,
  threads,
  unreadThreadIds,
  onSelectAgent,
  onSelectThread,
  onNewThread,
  onSelectDecisions,
  currentRole = 'chairman',
  vpProfile = null,
  chairmanAway = null,
  onSwitchToVp,
  onSwitchToChairman,
  onOpenVpSetup,
  onOpenAwayModal,
}) {
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

            {agent === 'CTO' && (
              <div
                className={`sidebar-item sidebar-item-sub-agent ${activeView === 'chat' && selectedAgent === 'FORGE' ? 'active' : ''}`}
                onClick={() => onSelectAgent('FORGE')}
              >
                <div className="sidebar-sub-connector" />
                <div className="agent-dot" style={{ background: AGENT_COLORS.FORGE, width: 6, height: 6 }} />
                <div className="sidebar-item-label">
                  <div style={{ fontSize: 12 }}>FORGE</div>
                  <div className="sidebar-item-sub">AI Developer</div>
                </div>
              </div>
            )}
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
                {hasUnread && <div className="thread-unread-dot" />}
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

      <div className="sidebar-divider" />

      <div style={{ paddingBottom: 4 }}>
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

        {/* Switch button */}
        {isVp ? (
          <button
            onClick={onSwitchToChairman}
            style={{
              width: '100%', background: 'none', border: '1px solid var(--border)',
              borderRadius: 6, padding: '5px 8px', cursor: 'pointer',
              fontSize: 10, color: 'var(--text-3)', fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 5,
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            <span style={{ color: 'var(--accent)' }}>◈</span> Back to Chairman
          </button>
        ) : vpProfile?.hasPin ? (
          <button
            onClick={onSwitchToVp}
            style={{
              width: '100%', background: 'none', border: '1px solid var(--border)',
              borderRadius: 6, padding: '5px 8px', cursor: 'pointer',
              fontSize: 10, color: 'var(--text-3)', fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 5,
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#94A3B8'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            <span style={{ color: '#94A3B8' }}>▷</span> {vpName} mode
          </button>
        ) : null}
      </div>
    </div>
  )
}
