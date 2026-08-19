const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('promptInput');
const gameLabelEl = document.getElementById('gameLabel');

async function refreshGameLabel() {
  const [game, provider] = await Promise.all([
    window.copilot.getCurrentGame(),
    window.copilot.getCurrentProvider(),
  ]);
  const gameName = game?.name ? game.name : 'no game detected';
  gameLabelEl.textContent = `${gameName} · ${provider}`;
}
refreshGameLabel();
setInterval(refreshGameLabel, 3000);

// --- Manual resize handle -----------------------------------------------
// Frameless windows lose the OS resize grips, so we track the handle drag
// ourselves and ask the main process to set the window bounds directly.
const resizeHandle = document.getElementById('resizeHandle');
let resizing = false;
let startX = 0;
let startY = 0;
let startWidth = 0;
let startHeight = 0;

resizeHandle.addEventListener('mousedown', (e) => {
  resizing = true;
  startX = e.screenX;
  startY = e.screenY;
  startWidth = window.innerWidth;
  startHeight = window.innerHeight;
  e.preventDefault();
});

window.addEventListener('mousemove', (e) => {
  if (!resizing) return;
  // Handle is bottom-left; dragging left grows width (panel is docked to
  // the screen's right edge, so it should expand into free space on the
  // left, not push off-screen to the right).
  const newWidth = startWidth - (e.screenX - startX);
  const newHeight = startHeight + (e.screenY - startY);
  window.copilot.resize(newWidth, newHeight);
});

window.addEventListener('mouseup', () => {
  resizing = false;
});

function addMessage(role, text) {
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  el.textContent = text;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return el;
}

inputEl.addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter') return;
  const prompt = inputEl.value.trim();
  if (!prompt) return;

  inputEl.value = '';
  addMessage('user', prompt);
  const pending = addMessage('pending', 'thinking...');

  const result = await window.copilot.ask(prompt);

  pending.remove();
  addMessage('assistant', result.text);
});
