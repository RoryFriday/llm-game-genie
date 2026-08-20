const { desktopCapturer, screen } = require('electron');

// Cap the screenshot so it doesn't blow past API size/token limits.
// 1280px wide is plenty for the model to read UI text and see what's
// on screen; JPEG keeps the payload small (~100-300 KB vs multi-MB PNG).
const MAX_WIDTH = 1280;
const JPEG_QUALITY = 80;

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

  let image = primary.thumbnail;

  // Downscale if wider than the cap (keeps aspect ratio).
  const imgSize = image.getSize();
  if (imgSize.width > MAX_WIDTH) {
    const scale = MAX_WIDTH / imgSize.width;
    image = image.resize({
      width: Math.round(imgSize.width * scale),
      height: Math.round(imgSize.height * scale),
    });
  }

  return image.toJPEG(JPEG_QUALITY).toString('base64');
}

module.exports = { captureScreenshotBase64 };
