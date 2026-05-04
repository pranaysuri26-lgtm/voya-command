const cron = require('node-cron')
const agentManager = require('./agentManager')
const broadcast = require('../ws/broadcast')

function start() {
  // Daily briefing at 9am
  cron.schedule('0 9 * * *', async () => {
    try {
      console.log('[Scheduler] Running daily briefing...')
      const result = await agentManager.triggerDailyBriefing()

      broadcast.broadcast('briefing-ready', {
        type: 'daily',
        results: result.results,
        approvals: result.approvals,
        timestamp: new Date().toISOString(),
      })

      if (result.approvals.length > 0) {
        for (const approval of result.approvals) {
          broadcast.broadcast('new-approval', approval)
        }
      }
    } catch (err) {
      console.error('[Scheduler] Daily briefing failed:', err.message)
    }
  })

  console.log('[Scheduler] Cron jobs registered')
}

module.exports = { start }
