export default function ChairmanAwayBanner({ awayInfo, vpName, onReturn }) {
  if (!awayInfo?.active) return null

  let returnStr = 'further notice'
  if (awayInfo.returnDate) {
    try {
      returnStr = new Date(awayInfo.returnDate).toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      })
    } catch (_) { returnStr = awayInfo.returnDate }
  }

  return (
    <div style={{
      position: 'relative',
      background: 'linear-gradient(90deg, #78350f 0%, #92400e 50%, #78350f 100%)',
      borderBottom: '1px solid #f59e0b44',
      padding: '7px 16px',
      display: 'flex', alignItems: 'center', gap: 10,
      flexShrink: 0, zIndex: 20,
      WebkitAppRegion: 'no-drag',
    }}>
      {/* Amber pulse dot */}
      <div style={{
        width: 8, height: 8, borderRadius: '50%',
        background: '#fbbf24',
        boxShadow: '0 0 0 3px #fbbf2433',
        flexShrink: 0,
        animation: 'pulse-dot 2s ease-in-out infinite',
      }} />

      <span style={{ fontSize: 11, color: '#fde68a', fontWeight: 700, letterSpacing: 0.3 }}>
        CHAIRMAN AWAY MODE
      </span>
      <span style={{ fontSize: 11, color: '#fcd34d', margin: '0 2px' }}>·</span>
      <span style={{ fontSize: 11, color: '#fde68a' }}>
        <strong style={{ color: '#fbbf24' }}>{vpName || 'VP'}</strong> has full authority
      </span>
      <span style={{ fontSize: 11, color: '#fcd34d', margin: '0 2px' }}>·</span>
      <span style={{ fontSize: 11, color: '#fde68a' }}>
        Returns {returnStr}
      </span>

      {onReturn && (
        <button
          onClick={onReturn}
          style={{
            marginLeft: 'auto', background: '#fbbf2422',
            border: '1px solid #fbbf2466', borderRadius: 6,
            color: '#fde68a', fontSize: 10, fontWeight: 700,
            padding: '3px 10px', cursor: 'pointer',
            letterSpacing: 0.3,
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#fbbf2444'}
          onMouseLeave={e => e.currentTarget.style.background = '#fbbf2422'}
        >
          ↩ Chairman Returned
        </button>
      )}
    </div>
  )
}
