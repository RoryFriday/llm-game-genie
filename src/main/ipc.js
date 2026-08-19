const { ipcMain } = require('electron');
const { getCurrentGame } = require('./game-detection');
const { getOverlayWindow } = require('./window');
const { captureScreenshotBase64 } = require('./screenshot');
const { generateAnswer, getProvider } = require('../providers/index');

// --- LLM call -----------------------------------------------------------
// All the provider-specific request/response shape lives in providers/*;
// this just gathers what the provider needs and hands off.
async function askCopilot(userPrompt) {
  const screenshotBase64 = await captureScreenshotBase64();
  return generateAnswer({
    prompt: userPrompt,
    screenshotBase64,
    gameContext: getCurrentGame(),
  });
}

function registerIpcHandlers() {
  ipcMain.handle('get-current-game', () => getCurrentGame());
  ipcMain.handle('get-current-provider', () => getProvider().name);

  ipcMain.handle('resize-overlay', (_event, { width, height }) => {
    const overlayWindow = getOverlayWindow();
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
}

module.exports = { registerIpcHandlers };
