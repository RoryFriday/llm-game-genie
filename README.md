# Game Copilot Overlay - sketch

## Run it
1. `npm install`
2. Pick a provider and set its key:
   - `export LLM_PROVIDER=gemini && export GEMINI_API_KEY=...` (default if unset)
   - `export LLM_PROVIDER=anthropic && export ANTHROPIC_API_KEY=sk-ant-...`
3. `npm start`
4. Press Alt+Space over any game to bring the panel up; press again to hide.

## Swapping LLM providers
`providers/index.js` is the only file that knows which backend is active
- it reads `LLM_PROVIDER` once and caches the choice. `main.js` calls the
generic `generateAnswer({ prompt, screenshotBase64, gameContext })` and
never touches provider-specific code.

To add a third provider (OpenAI, a local model, whatever): drop a new
file in `providers/` exporting `{ name, generateAnswer }` with that same
signature, register it in the `registry` object in `providers/index.js`,
done. `providers/prompt.js` holds the shared system-prompt text so tone
and behavior don't drift between backends.

Both provider SDKs are listed as regular dependencies for simplicity in
this sketch; only the selected one is actually `require`'d at runtime
(lazy-loaded inside each provider's `getClient()`), so a missing API key
for the *other* provider won't break anything.

## Sizing and positioning
- The overlay is a fixed 480x640 window docked top-right by default -
  it never covers the full screen. That size/position is just where the
  window is created; both are easy to change (see `createOverlayWindow`
  in main.js for the initial numbers).
- It's now genuinely resizable: drag the small handle in the bottom-left
  corner of the panel. Frameless windows (`frame: false`) lose the OS's
  native resize grips, so instead of relying on `resizable: true` alone,
  the handle tracks the drag itself and calls `overlayWindow.setBounds()`
  in the main process. The right edge stays anchored so growing the panel
  expands into the screen rather than pushing off the right side.
- `minWidth`/`minHeight`/`maxWidth`/`maxHeight` on the BrowserWindow keep
  it from being dragged to something unusable.
- Not persisted yet - it resets to the default size on relaunch. Worth
  adding if you keep using this: store the last width/height (e.g. in a
  small JSON file via `app.getPath('userData')`) and restore it in
  `createOverlayWindow`.

## What's deliberately simple here
- Single global hotkey toggles show/hide (no partial click-through state
  to manage - simplest thing that works reliably).
- One screenshot per question, taken fresh at ask-time, not on a timer.
- No process injection, no memory reads - it only ever reads pixels off
  the screen, so it shouldn't trip anti-cheat (EAC/BattlEye/Vanguard) the
  way DLL-injected overlays can.
- Multi-monitor: `captureScreenshotBase64` just grabs the first screen
  source. Swap in matching against `overlayWindow.getBounds()` /
  `screen.getDisplayNearestPoint()` to grab the monitor the game is
  actually on.

## What's now wired up
- **Game detection**: `active-win` polls the foreground window every 3s
  (name + title). It's shown in the overlay header and injected into the
  system prompt so the model knows what game it's looking at without
  having to guess from the screenshot alone.
- **Web search**: grounding via Gemini's `googleSearch` tool or
  Anthropic's `web_search` tool, depending on which provider is active -
  see `providers/gemini.js` / `providers/anthropic.js`. Same shape either
  way: server-side, single call, the model decides whether to search.
  One constraint worth knowing on the Gemini side: the API currently
  won't let you combine `googleSearch` with other tool types (like
  function calling) in the same request.

## Caveats worth knowing before this becomes anything more than a sketch
- `active-win` is ESM-only, hence the `await import(...)` instead of a
  plain `require`. On macOS it needs Screen Recording permission granted
  to the Electron app to read window titles at all.
- The window-title-based game name (e.g. "FINAL FANTASY XIV") is a loose
  signal, not a reliable game ID - fine for prompting, not something to
  key a knowledge base lookup off without normalizing it first.
- Still no client-side agent loop. If you later want the copilot to take
  multi-step actions (e.g. "check three different wikis and compare"),
  that's the point where you'd want something closer to pi's
  orchestrator/worker shape instead of a single tool-enabled call.

## Natural next steps
- Swap Enter-to-send for streaming responses (Anthropic SDK supports
  `.stream()`) so the panel fills in token-by-token instead of waiting.
- True exclusive-fullscreen games won't show any overlay window at all -
  worth a startup check that nudges the player to run the game in
  borderless/windowed mode.
- Normalize `currentGame.name` against a known-games list so you can key
  per-game system prompts, allowed_domains, or a curated wiki index.
