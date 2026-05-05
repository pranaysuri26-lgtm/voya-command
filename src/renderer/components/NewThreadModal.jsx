import { useState, useEffect, useRef } from 'react'

const AI_AGENTS = [
  { key: 'CPO',   label: 'CPO',   role: 'Product',     color: '#818cf8' },
  { key: 'CMO',   label: 'CMO',   role: 'Marketing',   color: '#f472b6' },
  { key: 'CTO',   label: 'CTO',   role: 'Technology',  color: '#22d3ee' },
  { key: 'CFO',   label: 'CFO',   role: 'Finance',     color: '#34d399' },
  { key: 'COO',   label: 'COO',   role: 'Operations',  color: '#fbbf24' },
  { key: 'FORGE', label: 'FORGE', role: 'AI Developer', color: '#00BCD4' },
]

export default function NewThreadModal({ onClose, onCreate, vpProfile = null, currentRole = 'chairman' }) {
  const [name, setName] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [creating, setCreating] = useState(false)
  const nameRef = useRef(null)

  useEffect(() => {
    nameRef.current?.focus()
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  function toggleAgent(key) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  async function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed || selected.size === 0 || creating) return
    setCreating(true)
    try {
      const thread = await window.voyaAPI.createThread(trimmed, [...selected])
      onCreate(thread.id)
    } finally {
      setCreating(false)
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCreate() }
  }

  const canCreate = name.trim().length > 0 && selected.size > 0

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 200,
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--bg-2)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: 24, width: 400,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', marginBottom: 20 }}>
          New Thread
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 6, fontWeight: 600 }}>
            THREAD NAME
          </div>
          <input
            ref={nameRef}
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={handleKey}
            placeholder="e.g. Launch Planning, Pricing Strategy…"
            style={{
              width: '100%', background: 'var(--bg-3)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              padding: '8px 12px', fontSize: 13, color: 'var(--text-1)',
              outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8, fontWeight: 600 }}>
            ADD MEMBERS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>

            {/* Human participants — VP sees Chairman, Chairman sees VP */}
            {(() => {
              const humanKey   = currentRole === 'vp' ? 'CHAIRMAN' : 'VP'
              const humanColor = currentRole === 'vp' ? 'var(--accent)' : '#94A3B8'
              const humanLabel = currentRole === 'vp' ? 'Chairman' : (vpProfile?.name || 'VP')
              const humanRole  = currentRole === 'vp' ? 'Human · Chairman' : 'Human · VP'
              return (
                <div
                  key={humanKey}
                  onClick={() => toggleAgent(humanKey)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '7px 10px', borderRadius: 'var(--radius)',
                    cursor: 'pointer',
                    background: selected.has(humanKey) ? '#ffffff10' : 'transparent',
                    border: `1px solid ${selected.has(humanKey) ? '#ffffff33' : 'transparent'}`,
                    transition: 'all 0.12s',
                  }}
                >
                  <div style={{
                    width: 14, height: 14, borderRadius: 3,
                    border: `2px solid ${selected.has(humanKey) ? humanColor : 'var(--border)'}`,
                    background: selected.has(humanKey) ? humanColor : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, transition: 'all 0.12s',
                  }}>
                    {selected.has(humanKey) && (
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path d="M1 4l2 2 4-4" stroke="#000" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    )}
                  </div>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: humanColor, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: humanColor }}>{humanLabel}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{humanRole}</span>
                </div>
              )
            })()}

            {/* Divider between human and AI agents */}
            {(
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0' }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
                <span style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 600 }}>AI AGENTS</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
              </div>
            )}

            {AI_AGENTS.map(a => (
              <div
                key={a.key}
                onClick={() => toggleAgent(a.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 10px', borderRadius: 'var(--radius)',
                  cursor: 'pointer',
                  background: selected.has(a.key) ? `${a.color}18` : 'transparent',
                  border: `1px solid ${selected.has(a.key) ? a.color + '55' : 'transparent'}`,
                  transition: 'all 0.12s',
                }}
              >
                <div style={{
                  width: 14, height: 14, borderRadius: 3,
                  border: `2px solid ${selected.has(a.key) ? a.color : 'var(--border)'}`,
                  background: selected.has(a.key) ? a.color : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, transition: 'all 0.12s',
                }}>
                  {selected.has(a.key) && (
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path d="M1 4l2 2 4-4" stroke="#000" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  )}
                </div>
                <div
                  style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: a.color, flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 12, fontWeight: 700, color: a.color }}>{a.label}</span>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{a.role}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            className="btn btn-secondary"
            onClick={onClose}
            style={{ fontSize: 12, padding: '6px 14px' }}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleCreate}
            disabled={!canCreate || creating}
            style={{ fontSize: 12, padding: '6px 14px' }}
          >
            {creating ? 'Creating…' : 'Create Thread'}
          </button>
        </div>
      </div>
    </div>
  )
}
