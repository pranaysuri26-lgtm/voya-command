const WebSocket = require('ws')

let wss = null
const clients = new Set()

function init(server) {
  wss = new WebSocket.Server({ server })

  wss.on('connection', (ws, req) => {
    clients.add(ws)
    console.log(`[WS] Client connected — total: ${clients.size}`)

    // Handle client keepalive pings
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data)
        if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }))
      } catch { /* ignore */ }
    })

    ws.on('close', () => {
      clients.delete(ws)
      console.log(`[WS] Client disconnected — total: ${clients.size}`)
    })

    ws.on('error', (err) => {
      console.error('[WS] Client error:', err.message)
      clients.delete(ws)
    })

    // Send ping to keep connection alive
    ws.isAlive = true
    ws.on('pong', () => { ws.isAlive = true })
  })

  // Heartbeat — drop dead connections every 30s
  setInterval(() => {
    for (const ws of clients) {
      if (!ws.isAlive) {
        clients.delete(ws)
        ws.terminate()
        continue
      }
      ws.isAlive = false
      ws.ping()
    }
  }, 30_000)

  console.log('[WS] Server initialized')
}

function broadcast(eventType, payload) {
  if (!wss) return
  // Use 'event' as the routing key so that a 'type' field inside payload
  // (e.g. { type: 'message' } on thread-update events) never clobbers it.
  const msg = JSON.stringify({ event: eventType, ...payload })
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(msg) } catch { /* ignore */ }
    }
  }
}

module.exports = { init, broadcast }
