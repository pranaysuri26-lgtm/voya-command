const COLORS = {
  CPO: '#818cf8',
  CMO: '#f472b6',
  CTO: '#22d3ee',
  CFO: '#34d399',
  COO: '#fbbf24',
  FORGE: '#00BCD4',
  ALL: '#6366f1',
  CHAIRMAN: '#4f46e5',
}

export default function AgentAvatar({ agent, size = 28, rounded = 7 }) {
  const color = COLORS[agent] || '#888'
  const textColor = agent === 'COO' || agent === 'CFO' || agent === 'CTO' ? '#000' : '#000'

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: rounded,
        background: color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.floor(size * 0.38),
        fontWeight: 700,
        color: textColor,
        flexShrink: 0,
        letterSpacing: '-0.02em',
      }}
    >
      {agent === 'CHAIRMAN' ? 'C' : agent === 'ALL' ? '★' : agent.slice(0, 2)}
    </div>
  )
}
