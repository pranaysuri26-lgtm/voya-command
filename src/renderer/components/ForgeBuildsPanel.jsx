import { useState, useEffect } from 'react'
import AgentAvatar from './AgentAvatar'

function formatTimeAgo(ts) {
  const d = new Date(ts)
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return d.toLocaleDateString()
}

function fileIcon(lang) {
  if (lang === 'html') return '🌐'
  if (lang === 'javascript' || lang === 'jsx') return '⚡'
  if (lang === 'typescript' || lang === 'tsx') return '🔷'
  if (lang === 'css') return '🎨'
  if (lang === 'json') return '{}'
  if (lang === 'python') return '🐍'
  return '📄'
}

function langLabel(lang) {
  const map = { html: 'HTML', javascript: 'JS', jsx: 'JSX', typescript: 'TS', tsx: 'TSX', css: 'CSS', json: 'JSON', python: 'Python', markdown: 'MD' }
  return map[lang] || (lang || 'FILE').toUpperCase()
}

export default function ForgeBuildsPanel({ onNewBuildEvent }) {
  const [sessions, setSessions] = useState([])
  const [expanded, setExpanded] = useState(null) // session_id
  const [preview, setPreview] = useState(null)   // { id, filename, language, url }
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
    const unsub = window.voyaAPI.on('forge-build', (data) => {
      load()
      if (onNewBuildEvent) onNewBuildEvent(data)
    })
    return () => unsub?.()
  }, [])

  async function load() {
    try {
      const data = await window.voyaAPI.getForgeBuilds()
      setSessions(data || [])
      if (!expanded && data?.length > 0) setExpanded(data[0].session_id)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  function openPreview(file) {
    const url = window.voyaAPI.forgePreviewUrl(file.id)
    setPreview({ ...file, url })
  }

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Loading FORGE builds…</div>
    </div>
  )

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div className="panel-header">
        <AgentAvatar agent="FORGE" size={28} rounded={7} />
        <div>
          <h2 style={{ color: '#00BCD4' }}>FORGE</h2>
          <div className="panel-header-sub">Build history</div>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 12,
          color: 'var(--text-3)',
        }}>
          <div style={{ fontSize: 32 }}>🔨</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)' }}>No builds yet</div>
          <div style={{ fontSize: 12, textAlign: 'center', maxWidth: 260, lineHeight: 1.5 }}>
            Message FORGE and ask it to build something — landing pages, components, anything.
            Files appear here automatically.
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sessions.map((session) => (
            <div
              key={session.session_id}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 10,
                overflow: 'hidden',
                background: expanded === session.session_id ? 'var(--bg-3)' : 'var(--bg-2)',
              }}
            >
              {/* Session header */}
              <div
                onClick={() => setExpanded(expanded === session.session_id ? null : session.session_id)}
                style={{
                  padding: '12px 14px',
                  display: 'flex', alignItems: 'center', gap: 10,
                  cursor: 'pointer',
                  borderBottom: expanded === session.session_id ? '1px solid var(--border)' : 'none',
                }}
              >
                <span style={{ fontSize: 14 }}>🔨</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 600, color: 'var(--text-1)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {session.task_description
                      ? session.task_description.slice(0, 80)
                      : `Build session · ${session.files.length} file${session.files.length > 1 ? 's' : ''}`}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
                    {session.files.length} file{session.files.length > 1 ? 's' : ''} · {formatTimeAgo(session.created_at)}
                  </div>
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
                  {expanded === session.session_id ? '▲' : '▼'}
                </span>
              </div>

              {/* File list */}
              {expanded === session.session_id && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {session.files.map((file) => (
                    <div
                      key={file.id}
                      style={{
                        padding: '10px 14px',
                        display: 'flex', alignItems: 'center', gap: 10,
                        borderBottom: '1px solid var(--border)',
                        background: 'var(--bg-2)',
                      }}
                    >
                      <span style={{ fontSize: 16, flexShrink: 0 }}>{fileIcon(file.language)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 11, fontWeight: 600, color: 'var(--text-1)',
                          fontFamily: 'monospace',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {file.filename}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>
                          {langLabel(file.language)} · {Math.round((file.content?.length || 0) / 1000 * 10) / 10}KB
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        {file.language === 'html' && (
                          <button
                            onClick={() => openPreview(file)}
                            style={{
                              background: '#00BCD422', border: '1px solid #00BCD444',
                              color: '#00BCD4', borderRadius: 5,
                              fontSize: 10, padding: '4px 9px', cursor: 'pointer',
                              fontWeight: 600, letterSpacing: '0.03em',
                            }}
                          >
                            Preview
                          </button>
                        )}
                        <button
                          onClick={() => {
                            const url = window.voyaAPI.forgePreviewUrl(file.id)
                            window.open(url, '_blank')
                          }}
                          style={{
                            background: 'none', border: '1px solid var(--border)',
                            color: 'var(--text-2)', borderRadius: 5,
                            fontSize: 10, padding: '4px 9px', cursor: 'pointer',
                          }}
                        >
                          Open ↗
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Preview modal */}
      {preview && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setPreview(null)}
        >
          <div
            style={{
              width: '90vw', height: '88vh', borderRadius: 12,
              overflow: 'hidden', border: '1px solid var(--border)',
              display: 'flex', flexDirection: 'column',
              background: 'var(--bg-2)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div style={{
              padding: '10px 16px',
              display: 'flex', alignItems: 'center', gap: 10,
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg-3)',
            }}>
              <span style={{ fontSize: 16 }}>{fileIcon(preview.language)}</span>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-1)' }}>
                {preview.filename}
              </span>
              <button
                onClick={() => window.open(preview.url, '_blank')}
                style={{
                  background: '#00BCD422', border: '1px solid #00BCD444',
                  color: '#00BCD4', borderRadius: 5,
                  fontSize: 10, padding: '5px 10px', cursor: 'pointer', fontWeight: 600,
                }}
              >
                Open full page ↗
              </button>
              <button
                onClick={() => setPreview(null)}
                style={{
                  background: 'none', border: 'none', color: 'var(--text-3)',
                  fontSize: 18, cursor: 'pointer', padding: '0 4px',
                }}
              >
                ×
              </button>
            </div>
            {/* iframe preview */}
            <iframe
              src={preview.url}
              style={{ flex: 1, border: 'none', background: '#fff' }}
              title={preview.filename}
            />
          </div>
        </div>
      )}
    </div>
  )
}
