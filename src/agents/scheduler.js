const cron = require('node-cron')
const agentManager = require('./agentManager')
const db = require('../database/db')

let mainWindowRef = null

function start(mainWindow) {
  mainWindowRef = mainWindow

  // Daily briefing at 9am
  cron.schedule('0 9 * * *', async () => {
    try {
      const result = await agentManager.triggerDailyBriefing()

      if (mainWindowRef && !mainWindowRef.isDestroyed()) {
        mainWindowRef.webContents.send('briefing-ready', {
          type: 'daily',
          results: result.results,
          approvals: result.approvals,
          timestamp: new Date().toISOString(),
        })

        if (result.approvals.length > 0) {
          for (const approval of result.approvals) {
            mainWindowRef.webContents.send('new-approval', approval)
          }
        }
      }
    } catch (err) {
      console.error('[Scheduler] Daily briefing failed:', err.message)
    }
  })
}

module.exports = { start }
