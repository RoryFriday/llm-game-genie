# Refactor Spec: game-copilot-overlay → npm-package layout

## Goal
Restructure the existing flat-file Electron sketch into a directory layout
suitable for publishing as an npm package (global install via `npm install -g`,
CLI entry point) while remaining buildable as a desktop installer via
electron-builder later. **This is a pure refactor: no behavior, features, or
UI should change.** If a reviewer runs the app before and after, they should
not be able to tell the difference except that it now launches via a CLI
command instead of `npm start` / `electron .` directly.

## Scope
In scope: moving files, splitting `main.js` into smaller modules, updating
all `require`/`import` paths, updating `package.json`, adding a `bin` entry
point, adding `.gitignore` and `.env.example`.

Out of scope (do not do these in this pass): adding tests, adding
electron-builder config, adding CI workflows, changing any provider logic,
changing any prompt text, changing the resize/hotkey/game-detection behavior.
These are noted in the target structure for future reference but should be
left as empty placeholders or simply omitted if not explicitly listed below.

## Current state (input to this refactor)
```
game-copilot-overlay/
├── main.js
├── preload.js
├── overlay.html
├── renderer.js
├── providers/
│   ├── index.js
│   ├── prompt.js
│   ├── anthropic.js
│   └── gemini.js
├── package.json
└── README.md
```

## Target structure (output of this refactor)
```
game-copilot-overlay/
├── bin/
│   └── game-copilot-overlay.js
├── src/
│   ├── main/
│   │   ├── index.js
│   │   ├── window.js
│   │   ├── game-detection.js
│   │   ├── screenshot.js
│   │   └── ipc.js
│   ├── preload/
│   │   └── preload.js
│   ├── renderer/
│   │   ├── overlay.html
│   │   ├── renderer.js
│   │   └── styles.css
│   └── providers/
│       ├── index.js
│       ├── prompt.js
│       ├── anthropic.js
│       └── gemini.js
├── assets/
│   └── (empty for now - icon files come later, not part of this refactor)
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

Do not create `test/`, `.github/`, `electron-builder.yml`, `CHANGELOG.md`, or
`LICENSE` in this pass - explicitly out of scope.

## File-by-file migration instructions

### `src/providers/*`
Move the `providers/` directory to `src/providers/` unchanged - no file
inside it needs content edits, only the directory moves. `require('./prompt')`
and sibling requires inside these files stay relative and don't need path
changes since the files move together as a unit.

### `src/renderer/overlay.html`, `src/renderer/renderer.js`
Move both files into `src/renderer/`. Additionally:
- Extract the entire `<style>...</style>` block out of `overlay.html` into a
  new `src/renderer/styles.css`.
- Replace the removed `<style>` block with `<link rel="stylesheet" href="styles.css" />`
  in the `<head>`.
- Update the `<script src="renderer.js">` tag - path stays `renderer.js`
  since it's a sibling file in the same directory, no change needed there.
- `renderer.js` itself needs no content changes.

### `src/preload/preload.js`
Move unchanged. No content edits needed - it has no relative requires to
other project files (`electron` is a bare specifier, resolved via
node_modules regardless of file location).

### `main.js` → split into `src/main/*`
This is the only file requiring structural surgery. Split by responsibility
as follows. Preserve all comments from the original when moving code - they
contain rationale (anti-cheat notes, right-edge anchoring, etc.) that should
not be lost.

**`src/main/window.js`**
Exports: `createOverlayWindow()`, `toggleOverlay()`, `getOverlayWindow()`.
Contains: the `overlayWindow` variable, `visible` variable, the
`createOverlayWindow` function body (BrowserWindow construction, the
`setAlwaysOnTop`/`setVisibleOnAllWorkspaces` calls, `loadFile`), and the
`toggleOverlay` function. Add a `getOverlayWindow()` export that returns the
`overlayWindow` reference, since other modules (ipc.js) need to call
`.getBounds()` / `.setBounds()` on it without owning the variable themselves.

**`src/main/game-detection.js`**
Exports: `pollActiveWindow()`, `getCurrentGame()`, `startPolling()`,
`stopPolling()`.
Contains: the `currentGame` variable, the `pollActiveWindow` async function
(including the dynamic `import('active-win')`), and new thin wrapper
functions `startPolling()` (does the initial `pollActiveWindow()` call plus
`setInterval(pollActiveWindow, 3000)`, stores the timer) and `stopPolling()`
(clears that timer) so `src/main/index.js` doesn't manage the interval
directly. `getCurrentGame()` returns the `currentGame` value.

**`src/main/screenshot.js`**
Exports: `captureScreenshotBase64()`.
Contains: exactly the existing `captureScreenshotBase64` function body,
unchanged. Needs `desktopCapturer` and `screen` from `electron`.

**`src/main/ipc.js`**
Exports: `registerIpcHandlers()`.
Contains: all five `ipcMain.handle(...)` calls (`get-current-game`,
`get-current-provider`, `resize-overlay`, `ask-copilot`), plus the
`askCopilot(userPrompt)` helper function that calls
`captureScreenshotBase64()` and `generateAnswer(...)`. This module imports
`getCurrentGame` from `./game-detection.js`, `getOverlayWindow` from
`./window.js`, `captureScreenshotBase64` from `./screenshot.js`, and
`generateAnswer`/`getProvider` from `../providers/index.js`. Wrap all the
handler registration in a single exported `registerIpcHandlers()` function
so `index.js` can call it once during startup instead of having top-level
`ipcMain.handle` calls scattered across the module.

**`src/main/index.js`**
This becomes the new entry point (replaces old `main.js`). Contains only:
the `app.whenReady().then(...)` block, `globalShortcut.register('Alt+Space', toggleOverlay)`
call, the `app.on('will-quit', ...)` and `app.on('window-all-closed', ...)`
handlers. Imports `createOverlayWindow`, `toggleOverlay` from `./window.js`;
`startPolling`, `stopPolling` from `./game-detection.js`; `registerIpcHandlers`
from `./ipc.js`. Calls `registerIpcHandlers()` once at the top of the
`whenReady` callback, before or after `createOverlayWindow()` (order doesn't
matter since handlers just register callbacks). Replace
`overlayWindow.loadFile('overlay.html')` (inside window.js) with
`overlayWindow.loadFile(path.join(__dirname, '../renderer/overlay.html'))` -
this is the one required path fix since the renderer files moved relative to
where `main/window.js` now lives. Similarly, `preload.js`'s path in the
`BrowserWindow` constructor's `webPreferences.preload` needs updating to
`path.join(__dirname, '../preload/preload.js')`.

### `bin/game-copilot-overlay.js` (new file)
Purpose: the CLI entry point that `npm install -g` wires up as the
`game-copilot-overlay` command. Electron apps can't be launched by requiring
them directly from a normal Node script - they need the actual `electron`
binary. This script should:
1. Have a `#!/usr/bin/env node` shebang as the first line.
2. Resolve the path to the locally-installed `electron` binary (the
   `electron` npm package exposes its binary path via `require('electron')`,
   which returns a string path to the executable - not a JS API - when
   required from a plain Node context).
3. Use Node's `child_process.spawn` to launch that electron binary, passing
   the path to `src/main/index.js` as the argument, with `stdio: 'inherit'`
   so the user sees any console output.
4. Exit with the child process's exit code when it closes.

Keep this file small (roughly 15-20 lines) - it is purely a launcher, no
application logic belongs here.

## `package.json` changes
- Add `"bin": { "game-copilot-overlay": "./bin/game-copilot-overlay.js" }`.
- Add `"main": "src/main/index.js"` (update from whatever it currently
  points to).
- Add `"files": ["bin", "src", "assets"]` so `npm publish` doesn't ship
  README-adjacent cruft beyond what's needed to run.
- Add `"engines": { "node": ">=18" }`.
- Leave `dependencies` (`@anthropic-ai/sdk`, `@google/genai`, `active-win`,
  `electron`) and existing `scripts.start` as-is; you can update
  `scripts.start` to `"node ./bin/game-copilot-overlay.js"` if you want `npm
  start` to exercise the same path a real install would use, but this is
  optional, not required for the refactor to be considered complete.

## New files with placeholder/minimal content

**`.gitignore`**
Should at minimum ignore `node_modules/`, `.env`, and common OS cruft
(`.DS_Store`). Standard Node `.gitignore` content is fine here - no
project-specific entries needed yet.

**`.env.example`**
Document the two env vars the app reads, uncommented with placeholder
values:
```
LLM_PROVIDER=gemini
GEMINI_API_KEY=
ANTHROPIC_API_KEY=
```

## Acceptance criteria
1. `npm install && npm start` (or the equivalent updated start script)
   launches the overlay exactly as before: Alt+Space toggles it, game name +
   active provider show in the header, resize handle works, asking a
   question captures a screenshot and returns an answer from whichever
   provider `LLM_PROVIDER` selects.
2. No file's actual logic changed - every function that existed in the old
   `main.js` still exists with the same implementation, just relocated and,
   where noted above, exported from a smaller module.
3. All `require()`/`import()` paths resolve correctly from each file's new
   location - this is the most likely source of bugs in this refactor, so
   double-check every relative path (`./`, `../`) after moving files rather
   than assuming line-for-line copy is sufficient.
4. `overlay.html`'s `<link>` to `styles.css` resolves (same directory, no
   path issue expected, but verify).
5. Running `node bin/game-copilot-overlay.js` from the project root launches
   the app the same way `npm start` did before the refactor.
6. Old top-level files (`main.js`, `preload.js`, `overlay.html`,
   `renderer.js`) no longer exist at the project root after the migration -
   confirm they were moved, not copied (no duplicates left behind).

## Explicit non-goals for this pass
- Do not add persistence for overlay window size (mentioned as a future
  idea in the README - not part of this refactor).
- Do not add electron-builder packaging or GitHub Actions workflows.
- Do not change any provider code, prompt text, model names, or add new
  providers.
- Do not add automated tests.
- Do not change the hotkey, resize behavior, or anti-cheat-safety approach
  (screenshot-only capture) - these are working as designed.