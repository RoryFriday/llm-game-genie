const { app, globalShortcut } = require('electron');
const { createOverlayWindow, toggleOverlay } = require('./window');
const { startPolling, stopPolling } = require('./game-detection');
const { registerIpcHandlers } = require('./ipc');

app.whenReady().then(() => {
  registerIpcHandlers();
  createOverlayWindow();

  // Global hotkey works even when the game has focus.
  const registered = globalShortcut.register('Alt+Space', toggleOverlay);
  if (!registered) {
    console.error('Hotkey registration failed - Alt+Space may be taken by another app.');
  }

  startPolling();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopPolling();
});

app.on('window-all-closed', () => {
  // Keep running in the background even with the overlay hidden/closed on
  // non-macOS; comment this out if you want it to fully quit instead.
  if (process.platform !== 'darwin') app.quit();
});
