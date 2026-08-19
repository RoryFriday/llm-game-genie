const { app, BrowserWindow, globalShortcut, ipcMain, desktopCapturer, screen } = require('electron');
const path = require('path');
const { generateAnswer, getProvider } = require('./providers');

let overlayWindow = null;
let visible = false;

// --- Game detection -----------------------------------------------------
// Polls the foreground window's owning process/title. Cheap, no
// injection, works whether or not the overlay is currently visible.
// Note: 'active-win' ships as pure ESM, so it's dynamic-imported below.
// macOS requires the Screen Recording permission to see window titles;
// Linux needs an X11/wmctrl-capable session (Wayland support varies).
let currentGame = { name: null, title: null };

async function pollActiveWindow() {
  try {
    const activeWin = (await import('active-win')).default;
    const win = await activeWin();
    if (win) {
      currentGame = {
        name: win.owner?.name ?? null,   // e.g. "FINAL FANTASY XIV"
        title: win.title ?? null,        // window title bar text
      };
    }
  } catch (err) {
    // Non-fatal: worst case, game context is just omitted from the prompt.
    console.error('active-win poll failed:', err.message);
  }
}

function createOverlayWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  overlayWindow = new BrowserWindow({
    width: 480,
    height: 640,
    x: width - 500,          // dock it top-right; adjust to taste
    y: 40,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    minWidth: 320,
    minHeight: 220,
    maxWidth: 900,
    maxHeight: 1200,
    hasShadow: false,
    show: false,             // start hidden
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Keep it above fullscreen games on Windows/macOS.
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  overlayWindow.loadFile('overlay.html');
}

function toggleOverlay() {
  if (!overlayWindow) return;
  visible = !visible;

  if (visible) {
    overlayWindow.show();
    overlayWindow.focus();          // now accepts keyboard/mouse input
  } else {
    overlayWindow.hide();           // fully passes input back to the game
  }
}

// --- Screenshot capture -----------------------------------------------
// desktopCapturer grabs a still frame of the screen (no game-process
// injection, no memory reads -> avoids anti-cheat territory entirely).
async function captureScreenshotBase64() {
  const { width, height } = screen.getPrimaryDisplay().size;
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width, height },
  });

  const primary = sources[0]; // for multi-monitor setups, pick the right source here
  if (!primary) throw new Error('No screen source available for capture');

  return primary.thumbnail.toPNG().toString('base64');
}

// --- LLM call -----------------------------------------------------------
// All the provider-specific request/response shape lives in providers/*;
// this just gathers what the provider needs and hands off.
async function askCopilot(userPrompt) {
  const screenshotBase64 = await captureScreenshotBase64();
  return generateAnswer({
    prompt: userPrompt,
    screenshotBase64,
    gameContext: currentGame,
  });
}

ipcMain.handle('get-current-game', () => currentGame);
ipcMain.handle('get-current-provider', () => getProvider().name);

ipcMain.handle('resize-overlay', (_event, { width, height }) => {
  if (!overlayWindow) return;
  const bounds = overlayWindow.getBounds();
  const w = Math.round(width);
  const h = Math.round(height);
  // Keep the right edge anchored (panel is docked top-right) so growing
  // the window expands leftward into the screen instead of off it.
  const rightEdge = bounds.x + bounds.width;
  overlayWindow.setBounds({ x: rightEdge - w, y: bounds.y, width: w, height: h });
});

ipcMain.handle('ask-copilot', async (_event, prompt) => {
  try {
    return { ok: true, text: await askCopilot(prompt) };
  } catch (err) {
    return { ok: false, text: `Error: ${err.message}` };
  }
});

let pollTimer = null;

app.whenReady().then(() => {
  createOverlayWindow();

  // Global hotkey works even when the game has focus.
  const registered = globalShortcut.register('Alt+Space', toggleOverlay);
  if (!registered) {
    console.error('Hotkey registration failed - Alt+Space may be taken by another app.');
  }

  pollActiveWindow();
  pollTimer = setInterval(pollActiveWindow, 3000); // 3s is enough; this isn't latency-critical
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (pollTimer) clearInterval(pollTimer);
});

app.on('window-all-closed', () => {
  // Keep running in the background even with the overlay hidden/closed on
  // non-macOS; comment this out if you want it to fully quit instead.
  if (process.platform !== 'darwin') app.quit();
});
