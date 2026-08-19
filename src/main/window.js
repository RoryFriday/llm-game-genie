const { BrowserWindow, screen } = require('electron');
const path = require('path');

let overlayWindow = null;
let visible = false;

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
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Keep it above fullscreen games on Windows/macOS.
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  overlayWindow.loadFile(path.join(__dirname, '../renderer/overlay.html'));
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

function getOverlayWindow() {
  return overlayWindow;
}

module.exports = { createOverlayWindow, toggleOverlay, getOverlayWindow };
