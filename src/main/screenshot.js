const { desktopCapturer, screen } = require('electron');

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

module.exports = { captureScreenshotBase64 };
