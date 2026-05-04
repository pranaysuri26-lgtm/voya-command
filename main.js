require('dotenv').config()
const { app, BrowserWindow, ipcMain, shell, Menu, MenuItem, clipboard } = require('electron')
const path = require('path')
const fs = require('fs')

// Wire up the high-activity queue warning so the renderer can show a toast.
// agentManager registers the callback with claude.js's queue internally.
try {
  const agentManager = require('./src/agents/agentManager')
  agentManager.setHighActivityCallback((depth) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('high-activity', {
        message: 'High activity — responses may be delayed',
        depth,
      })
    }
  })
} catch { /* will fail gracefully if agentManager not present */ }

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0d0d0f',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.loadFile(path.join(__dirname, 'src/renderer/index.html'))

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  const menu = Menu.buildFromTemplate([
    { role: 'appMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ])
  Menu.setApplicationMenu(menu)

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ─── Screenshot ────────────────────────────────────────────────────────────────
ipcMain.handle('take-screenshot', async () => {
  const image = await mainWindow.webContents.capturePage()
  const buffer = image.toPNG()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `voya-command-${timestamp}.png`
  const savePath = path.join(app.getPath('desktop'), filename)
  fs.writeFileSync(savePath, buffer)
  shell.showItemInFolder(savePath)
  return { path: savePath, filename }
})

// ─── Context menu ──────────────────────────────────────────────────────────────
ipcMain.on('show-context-menu', (event, { selectedText }) => {
  const menu = new Menu()
  if (selectedText) {
    menu.append(new MenuItem({
      label: 'Copy',
      click: () => clipboard.writeText(selectedText),
    }))
    menu.append(new MenuItem({ type: 'separator' }))
  }
  menu.append(new MenuItem({
    label: 'Copy All Text',
    click: () => { if (selectedText) clipboard.writeText(selectedText) },
    enabled: !!selectedText,
  }))
  menu.popup({ window: BrowserWindow.fromWebContents(event.sender) })
})
