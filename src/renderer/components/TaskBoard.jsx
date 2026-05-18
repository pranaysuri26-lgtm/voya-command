import { useState, useEffect } from 'react'
import AgentAvatar from './AgentAvatar'

const AGENT_COLORS = {
  CPO: '#818cf8', CMO: '#f472b6', CTO: '#22d3ee',
  CFO: '#34d399', COO: '#fbbf24', FORGE: '#00BCD4',
  chairman: 'var(--accent)', vp: '#94A3B8', team: '#6b7280',
}

const PRIORITY_COLORS = { urgent: '#ef4444', high: '#f97316', medium: '#eab308', low: '#6b7280' }
const PRIORITY_ORDER  = { urgent: 0, high: 1, medium: 2, low: 3 }

const COLUMNS = [
  { key: 'todo',        label: 'To Do',       color: '#6b7280' },
  { key: 'in_progress', label: 'In Progress',  color: '#f59e0b' },
  { key: 'done',        label: 'Done',         color: '#22c55e' },
]

const ALL_OWNERS = ['COO', 'CPO', 'CMO', 'CTO', 'CFO', 'FORGE', 'chairman', 'vp', 'team']

function formatDeadline(d) {
  if (!d) return null
  const date = new Date(d)
  const today = new Date(); today.setHours(0,0,0,0)
  const diff = Math.ceil((date - today) / 86400000)
  if (diff < 0)  return { label: `${Math.abs(diff)}d overdue`, color: '#ef4444' }
  if (diff === 0) return { label: 'Due today', color: '#f97316' }
  if (diff <= 3)  return { label: `${diff}d left`, color: '#eab308' }
  return { label: date.toLocaleDateString([], { month: 'short', day: 'numeric' }), color: 'var(--text-3)' }
}

function TaskCard({ task, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(task.title)
  const ownerColor = AGENT_COLORS[task.owner] || '#6b7280'
  const deadline = formatDeadline(task.deadline)

  function saveEdit() {
    if (editTitle.trim() && editTitle !== task.title) {
      onUpdate(task.id, { title: editTitle.trim() })
    }
    setEditing(false)
  }

  return (
    <div style={{
      background: 'var(--bg-2)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '10px 12px', marginBottom: 6,
      cursor: 'default',
    }}>
      {/* Title */}
      {editing ? (
        <input
          autoFocus
          value={editTitle}
          onChange={e => setEditTitle(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false) }}
          style={{
            width: '100%', background: 'var(--bg-3)', border: '1px solid var(--accent)',
            borderRadius: 4, padding: '3px 6px', fontSize: 12, color: 'var(--text-1)',
            outline: 'none', boxSizing: 'border-box',
          }}
        />
      ) : (
        <div
          onDoubleClick={() => setEditing(true)}
          style={{ fontSize: 12, color: 'var(--text-1)', lineHeight: 1.4, marginBottom: 8, cursor: 'text' }}
        >
          {task.title}
        </div>
      )}

      {/* Meta row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {/* Owner */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <AgentAvatar agent={task.owner?.toUpperCase()} size={14} rounded={3} />
          <span style={{ fontSize: 10, fontWeight: 700, color: ownerColor }}>{task.owner?.toUpperCase()}</span>
        </div>

        {/* Priority */}
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
          background: PRIORITY_COLORS[task.priority] + '22',
          color: PRIORITY_COLORS[task.priority],
          border: `1px solid ${PRIORITY_COLORS[task.priority]}44`,
        }}>
          {task.priority?.toUpperCase()}
        </span>

        {/* Deadline */}
        {deadline && (
          <span style={{ fontSize: 9, color: deadline.color, fontWeight: 600 }}>
            {deadline.label}
          </span>
        )}

        {/* Source badge */}
        {task.source_type === 'agent' && (
          <span style={{ fontSize: 9, color: 'var(--text-3)', marginLeft: 'auto' }}>AI</span>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
        {COLUMNS.filter(c => c.key !== task.status).map(col => (
          <button
            key={col.key}
            onClick={() => onUpdate(task.id, { status: col.key })}
            style={{
              fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
              border: `1px solid ${col.color}44`, color: col.color,
              background: col.color + '11', cursor: 'pointer',
            }}
          >
            → {col.label}
          </button>
        ))}
        <button
          onClick={() => onDelete(task.id)}
          style={{
            fontSize: 9, padding: '2px 5px', borderRadius: 4,
            border: '1px solid var(--border)', color: 'var(--text-3)',
            background: 'transparent', cursor: 'pointer', marginLeft: 'auto',
          }}
        >✕</button>
      </div>
    </div>
  )
}

function NewTaskModal({ onClose, onCreate }) {
  const [title, setTitle] = useState('')
  const [owner, setOwner] = useState('team')
  const [priority, setPriority] = useState('medium')
  const [deadline, setDeadline] = useState('')

  async function submit() {
    if (!title.trim()) return
    await onCreate({ title: title.trim(), owner, priority, deadline: deadline || null })
    onClose()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300,
    }}
    onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: 'var(--bg-2)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 24, width: 360,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>New Task</div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4, fontWeight: 600 }}>TITLE</div>
          <input
            autoFocus value={title} onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="What needs to be done?"
            style={{
              width: '100%', background: 'var(--bg-3)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '7px 10px', fontSize: 13, color: 'var(--text-1)',
              outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4, fontWeight: 600 }}>OWNER</div>
            <select value={owner} onChange={e => setOwner(e.target.value)} style={{
              width: '100%', background: 'var(--bg-3)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '7px 10px', fontSize: 12, color: 'var(--text-1)', outline: 'none',
            }}>
              {ALL_OWNERS.map(o => <option key={o} value={o}>{o.toUpperCase()}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4, fontWeight: 600 }}>PRIORITY</div>
            <select value={priority} onChange={e => setPriority(e.target.value)} style={{
              width: '100%', background: 'var(--bg-3)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '7px 10px', fontSize: 12, color: 'var(--text-1)', outline: 'none',
            }}>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4, fontWeight: 600 }}>DEADLINE (optional)</div>
          <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} style={{
            width: '100%', background: 'var(--bg-3)', border: '1px solid var(--border)',
            borderRadius: 6, padding: '7px 10px', fontSize: 12, color: 'var(--text-1)', outline: 'none',
            boxSizing: 'border-box',
          }} />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose} style={{ fontSize: 12, padding: '6px 14px' }}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={!title.trim()} style={{ fontSize: 12, padding: '6px 14px' }}>Create Task</button>
        </div>
      </div>
    </div>
  )
}

export default function TaskBoard() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [ownerFilter, setOwnerFilter] = useState('ALL')

  useEffect(() => {
    load()
    const unsub = window.vondrerAPI.on('task-update', () => load())
    return () => unsub?.()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const data = await window.vondrerAPI.getTasks()
      setTasks(Array.isArray(data) ? data : [])
    } finally {
      setLoading(false)
    }
  }

  async function handleUpdate(id, fields) {
    await window.vondrerAPI.updateTask(id, fields)
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...fields } : t))
  }

  async function handleDelete(id) {
    await window.vondrerAPI.deleteTask(id)
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  async function handleCreate(data) {
    const task = await window.vondrerAPI.createTask(data)
    setTasks(prev => [task, ...prev])
  }

  const owners = ['ALL', ...new Set(tasks.map(t => t.owner).filter(Boolean))]
  const filtered = ownerFilter === 'ALL' ? tasks : tasks.filter(t => t.owner === ownerFilter)

  const byStatus = (status) => filtered
    .filter(t => t.status === status)
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])

  const overdueCount = tasks.filter(t => t.deadline && new Date(t.deadline) < new Date() && !['done','cancelled'].includes(t.status)).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div className="panel-header">
        <div>
          <h2>Tasks</h2>
          <div className="panel-header-sub">
            {tasks.filter(t => t.status !== 'done').length} open
            {overdueCount > 0 && <span style={{ color: '#ef4444', marginLeft: 6 }}>· {overdueCount} overdue</span>}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Owner filter */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {owners.map(o => (
              <button
                key={o}
                onClick={() => setOwnerFilter(o)}
                style={{
                  fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 8,
                  border: 'none', cursor: 'pointer',
                  background: ownerFilter === o ? (AGENT_COLORS[o.toLowerCase()] || 'var(--accent)') : 'var(--bg-3)',
                  color: ownerFilter === o ? '#000' : 'var(--text-3)',
                }}
              >{o}</button>
            ))}
          </div>
          <button className="btn btn-primary" onClick={() => setShowNew(true)} style={{ fontSize: 11, padding: '4px 10px' }}>
            + Task
          </button>
        </div>
      </div>

      {/* Kanban columns */}
      <div style={{ flex: 1, display: 'flex', gap: 12, padding: 16, overflow: 'hidden' }}>
        {COLUMNS.map(col => {
          const colTasks = byStatus(col.key)
          return (
            <div key={col.key} style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              background: 'var(--bg-3)', borderRadius: 10,
              border: '1px solid var(--border)', overflow: 'hidden',
            }}>
              {/* Column header */}
              <div style={{
                padding: '10px 12px', borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: col.color }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)' }}>{col.label}</span>
                <span style={{
                  marginLeft: 'auto', fontSize: 10, fontWeight: 700,
                  background: col.color + '22', color: col.color,
                  borderRadius: 8, padding: '1px 6px',
                }}>{colTasks.length}</span>
              </div>

              {/* Tasks */}
              <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
                {loading && colTasks.length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', marginTop: 20 }}>Loading…</div>
                )}
                {!loading && colTasks.length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', marginTop: 20 }}>Empty</div>
                )}
                {colTasks.map(task => (
                  <TaskCard key={task.id} task={task} onUpdate={handleUpdate} onDelete={handleDelete} />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {showNew && <NewTaskModal onClose={() => setShowNew(false)} onCreate={handleCreate} />}
    </div>
  )
}
