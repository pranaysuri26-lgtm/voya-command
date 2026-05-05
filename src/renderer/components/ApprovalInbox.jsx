import { useState } from 'react'
import AgentAvatar from './AgentAvatar'

const AGENT_COLORS = {
  CPO: '#818cf8',
  CMO: '#f472b6',
  CTO: '#22d3ee',
  CFO: '#34d399',
  COO: '#fbbf24',
  FORGE: '#00BCD4',
}

function formatDate(ts) {
  const d = new Date(ts)
  const now = new Date()
  const diff = now - d
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function ThreadCreationCard({ approval, onResolve, readOnly = false, vpCanApprove = false }) {
  const [loading, setLoading] = useState(false)
  let meta = {}
  try { meta = JSON.parse(approval.metadata || '{}') } catch (_) {}
  const members = meta.members || []
  const threadName = meta.name || approval.title.replace('Create thread: ', '')

  async function resolve(status) {
    if (!onResolve) return
    setLoading(true)
    await onResolve(approval.id, status, null)
    setLoading(false)
  }

  return (
    <div className="approval-card" style={{ borderLeft: `3px solid ${AGENT_COLORS[approval.agent] || 'var(--accent)'}` }}>
      <div className="approval-card-header">
        <AgentAvatar agent={approval.agent} size={22} rounded={5} />
        <span className="agent-tag" style={{ background: `${AGENT_COLORS[approval.agent]}18`, color: AGENT_COLORS[approval.agent] }}>
          {approval.agent}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-3)' }}>
          {formatDate(approval.proposed_at)}
        </span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 4, fontWeight: 600 }}>
        💬 THREAD REQUEST
      </div>
      <div className="approval-card-title">"{threadName}"</div>
      {members.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', margin: '6px 0' }}>
          {members.map(m => (
            <span key={m} style={{
              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 8,
              background: `${AGENT_COLORS[m] || '#888'}22`,
              color: AGENT_COLORS[m] || 'var(--text-2)',
            }}>{m}</span>
          ))}
        </div>
      )}
      {meta.reason && (
        <div className="approval-card-desc">{meta.reason}</div>
      )}
      {readOnly ? (
        <div style={{ fontSize: 11, color: '#f87171', fontStyle: 'italic', marginTop: 4, padding: '0 2px' }}>
          🔒 Customer-facing thread — Chairman approval required.
        </div>
      ) : vpCanApprove ? (
        <div>
          <div style={{ fontSize: 10, color: '#34d399', fontWeight: 600, marginBottom: 6, padding: '0 2px' }}>
            ✓ Internal thread — VP authority applies
          </div>
          <div className="approval-actions">
            <button className="btn btn-approve" onClick={() => resolve('approved')} disabled={loading}>
              ✓ Create Thread
            </button>
            <button className="btn btn-reject" onClick={() => resolve('rejected')} disabled={loading}>
              ✗ Decline
            </button>
          </div>
        </div>
      ) : (
        <div className="approval-actions">
          <button className="btn btn-approve" onClick={() => resolve('approved')} disabled={loading}>
            ✓ Create Thread
          </button>
          <button className="btn btn-reject" onClick={() => resolve('rejected')} disabled={loading}>
            ✗ Decline
          </button>
        </div>
      )}
    </div>
  )
}

// Classify whether a decision is customer-facing (VP cannot approve)
// or internal/staging (VP can approve)
const CUSTOMER_FACING_RE = /\b(customer|user[s]?|public|launch|market|brand|pricing|payment|billing|landing page|website|campaign|ad[s]?|email blast|press|announcement|feature release|onboard|signup|checkout|revenue|sales)\b/i
const INTERNAL_RE = /\b(staging|deploy|infra|database|migration|schema|cron|backup|server|api|internal|test|dev|ci|cd|pipeline|config|env|secret|aws|s3|r2|railway|codebase|refactor|dependency|node|package)\b/i

function isCustomerFacing(approval) {
  const text = `${approval.title} ${approval.description}`.toLowerCase()
  // If it explicitly matches internal/staging patterns, VP can handle it
  if (INTERNAL_RE.test(text)) return false
  // If it matches customer-facing patterns, Chairman only
  if (CUSTOMER_FACING_RE.test(text)) return true
  // Default: Chairman only for anything ambiguous
  return true
}

function ApprovalCard({ approval, onResolve, readOnly = false, vpCanApprove = false }) {
  const [loading, setLoading] = useState(false)
  const isHeld = approval.status === 'held'

  async function resolve(status) {
    if (!onResolve) return
    setLoading(true)
    await onResolve(approval.id, status, null)
    setLoading(false)
  }

  return (
    <div className={`approval-card${isHeld ? ' approval-card-held' : ''}`}>
      <div className="approval-card-header">
        <AgentAvatar agent={approval.agent} size={22} rounded={5} />
        <span
          className="agent-tag"
          style={{
            background: `${AGENT_COLORS[approval.agent]}18`,
            color: AGENT_COLORS[approval.agent],
          }}
        >
          {approval.agent}
        </span>
        {isHeld && (
          <span className="hold-badge">ON HOLD</span>
        )}
        <span style={{ marginLeft: isHeld ? 0 : 'auto', fontSize: 10, color: 'var(--text-3)' }}>
          {formatDate(approval.proposed_at)}
        </span>
      </div>

      <div className="approval-card-title">{approval.title}</div>
      <div className="approval-card-desc">{approval.description}</div>

      {readOnly ? (
        <div style={{ fontSize: 11, color: '#f87171', fontStyle: 'italic', marginTop: 4, padding: '0 2px' }}>
          🔒 Customer-facing — Chairman approval required.
        </div>
      ) : vpCanApprove ? (
        <div>
          <div style={{ fontSize: 10, color: '#34d399', fontWeight: 600, marginBottom: 6, padding: '0 2px' }}>
            ✓ Internal decision — VP authority applies
          </div>
          <div className="approval-actions">
            <button className="btn btn-approve" onClick={() => resolve('approved')} disabled={loading}>
              ✓ Approve
            </button>
            <button className="btn btn-reject" onClick={() => resolve('rejected')} disabled={loading}>
              ✗ Reject
            </button>
          </div>
        </div>
      ) : (
        <div className="approval-actions">
          <button className="btn btn-approve" onClick={() => resolve('approved')} disabled={loading}>
            ✓ Approve
          </button>
          <button className="btn btn-reject" onClick={() => resolve('rejected')} disabled={loading}>
            ✗ Reject
          </button>
          {!isHeld && (
            <button className="btn btn-hold" onClick={() => resolve('held')} disabled={loading} title="Park this decision for later">
              ⏸ Hold
            </button>
          )}
          <button
            className="btn btn-withdraw"
            onClick={() => resolve('withdrawn')}
            disabled={loading}
            title="No longer needed — remove from inbox without approving or rejecting"
          >
            ↩ Withdraw
          </button>
        </div>
      )}
    </div>
  )
}

export default function ApprovalInbox({ approvals, onResolve, currentRole = 'chairman', vpActing = false, vpName = 'VP' }) {
  const pending = approvals.filter((a) => a.status === 'pending' || a.status === 'held')
  const isVp = currentRole === 'vp'

  if (pending.length === 0) {
    return (
      <div className="empty-inbox">
        <div className="empty-inbox-icon">✓</div>
        <div>Inbox clear</div>
        <div style={{ marginTop: 4, color: 'var(--text-3)' }}>No pending decisions</div>
      </div>
    )
  }

  return (
    <div>
      {/* VP — can approve internal/staging, read-only on customer-facing */}
      {isVp && pending.length > 0 && (
        <div style={{
          margin: '8px 8px 4px', padding: '8px 10px',
          background: '#94A3B811', border: '1px solid #94A3B833',
          borderRadius: 6, fontSize: 11, color: '#94A3B8',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ fontWeight: 700 }}>VP</span>
          <span>You can approve internal & staging decisions. Customer-facing decisions require Chairman.</span>
        </div>
      )}
      {pending.map((a) => {
        const customerFacing = isCustomerFacing(a)
        const vpReadOnly = isVp && customerFacing
        const vpCanApprove = isVp && !customerFacing
        return a.type === 'thread_creation'
          ? <ThreadCreationCard key={a.id} approval={a} onResolve={vpReadOnly ? null : onResolve} readOnly={vpReadOnly} vpCanApprove={vpCanApprove} />
          : <ApprovalCard key={a.id} approval={a} onResolve={vpReadOnly ? null : onResolve} readOnly={vpReadOnly} vpCanApprove={vpCanApprove} />
      })}
    </div>
  )
}
