// --- Game detection -----------------------------------------------------
// Polls the foreground window's owning process/title. Cheap, no
// injection, works whether or not the overlay is currently visible.
// Note: 'active-win' ships as pure ESM, so it's dynamic-imported below.
// macOS requires the Screen Recording permission to see window titles;
// Linux needs an X11/wmctrl-capable session (Wayland support varies).
let currentGame = { name: null, title: null };
let pollTimer = null;

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

function getCurrentGame() {
  return currentGame;
}

function startPolling() {
  pollActiveWindow();
  pollTimer = setInterval(pollActiveWindow, 3000); // 3s is enough; this isn't latency-critical
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

module.exports = { pollActiveWindow, getCurrentGame, startPolling, stopPolling };
