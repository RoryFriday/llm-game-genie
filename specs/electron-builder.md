# Spec: Distributable Installers via electron-builder + GitHub Releases

## Goal
Ship platform-native installers (Windows `.exe`, macOS `.dmg`, Linux
`.AppImage`) that users can download from GitHub Releases and install
without needing Node.js, npm, or any CLI knowledge. The build should run
in CI (GitHub Actions) so a tagged push produces draft release artifacts
automatically.

## Scope
In scope: electron-builder configuration, build scripts in `package.json`,
app icon placeholders, a GitHub Actions workflow that builds on all three
platforms and uploads artifacts to a GitHub Release draft.

Out of scope (do not do these in this pass): code signing / notarization
(requires paid Apple Developer + Windows EV cert — document as a future
step), auto-update (`electron-updater` — note it as a natural follow-up
but don't wire it in), Snap/Flatpak/deb/rpm Linux targets beyond
AppImage, custom NSIS installer pages.

## Prerequisites
- The refactored directory layout from `specs/refactor.md` is complete.
- An `assets/` directory exists (currently empty).

## Deliverables

### 1. App icons — `assets/`

Create placeholder icon files so electron-builder has something to
reference. Real artwork can replace these later without config changes.

| File | Purpose |
|------|---------|
| `assets/icon.png` | 512×512 PNG, used as the source for all platforms |
| `assets/icon.icns` | macOS icon (electron-builder can generate from PNG, but providing it avoids a build-time dependency on `iconutil`) |
| `assets/icon.ico` | Windows icon (same — electron-builder can convert, but a pre-built `.ico` is more reliable cross-platform) |

For this pass, generate minimal single-color placeholder images (a solid
colored square with the letter "G" or the text "GCO" is fine). The point
is to have valid files at the expected paths so the build doesn't fail.
If generating real icons is impractical, document in the README that
these are placeholders and should be replaced.

### 2. `electron-builder.yml` (project root)

Use YAML config (electron-builder's preferred format). Key decisions:

```yaml
appId: com.game-copilot-overlay.app
productName: Game Copilot Overlay
copyright: Copyright © 2025

directories:
  output: dist
  buildResources: assets

files:
  - src/**/*
  - assets/**/*
  - "!**/node_modules/@anthropic-ai/sdk/node_modules/**"
  - "!**/node_modules/@google/genai/node_modules/**"

# --- Windows ---
win:
  target:
    - target: nsis
      arch:
        - x64
  icon: assets/icon.ico

nsis:
  oneClick: true
  perMachine: false
  allowToChangeInstallationDirectory: false
  deleteAppDataOnUninstall: false

# --- macOS ---
mac:
  target:
    - target: dmg
      arch:
        - x64
        - arm64
  icon: assets/icon.icns
  category: public.app-category.utilities
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist

dmg:
  contents:
    - x: 130
      y: 220
    - x: 410
      y: 220
      type: link
      path: /Applications

# --- Linux ---
linux:
  target:
    - target: AppImage
      arch:
        - x64
  icon: assets/icon.png
  category: Utility
```

Notes on specific choices:
- **NSIS one-click** keeps the Windows install simple (no wizard pages).
  `perMachine: false` installs to the user's AppData — no admin prompt.
- **macOS universal** is deferred; ship separate x64 + arm64 builds for
  now to keep build times down. `hardenedRuntime` is required for
  notarization later even though we're not notarizing yet.
- **AppImage** is the lowest-friction Linux target — single file, no
  package manager needed.
- The `files` globs should include everything the app needs at runtime.
  `active-win` has native bindings — electron-builder's `rebuild` step
  handles recompiling them for the target platform.

### 3. macOS entitlements — `build/entitlements.mac.plist`

Create `build/entitlements.mac.plist` (electron-builder convention):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.allow-dyld-environment-variables</key>
  <true/>
</dict>
</plist>
```

These are the minimum entitlements Electron needs to run under hardened
runtime. Screen Recording (`com.apple.security.device.screen-capture`)
is a user-granted permission prompt, not an entitlement, so it's not
listed here — macOS will prompt the user at runtime when
`desktopCapturer` is first called.

### 4. `package.json` changes

Add build-related scripts alongside the existing ones:

```json
{
  "scripts": {
    "start": "electron .",
    "dist": "electron-builder",
    "dist:win": "electron-builder --win",
    "dist:mac": "electron-builder --mac",
    "dist:linux": "electron-builder --linux"
  }
}
```

Add `electron-builder` as a dev dependency:

```json
{
  "devDependencies": {
    "electron-builder": "^25.0.0"
  }
}
```

Do **not** move `electron` from `dependencies` to `devDependencies` — it
needs to stay in `dependencies` so the CLI launcher (`bin/`) still works
for `npm install -g` users. electron-builder knows to exclude the
electron runtime from the bundle and use its own downloaded copy for the
target platform.

### 5. GitHub Actions workflow — `.github/workflows/build.yml`

Trigger: push of a tag matching `v*` (e.g. `v0.1.0`).

Strategy matrix: `os: [ubuntu-latest, macos-latest, windows-latest]`.

Steps per runner:
1. Checkout the repo.
2. Set up Node 20.
3. `npm ci` (clean install).
4. Run the platform-appropriate build:
   - `ubuntu-latest` → `npm run dist:linux`
   - `macos-latest` → `npm run dist:mac`
   - `windows-latest` → `npm run dist:win`
5. Upload the contents of `dist/` as workflow artifacts.
6. If the trigger is a tag, create (or update) a GitHub Release draft
   and attach the built artifacts using `softprops/action-gh-release`.

```yaml
name: Build Installers

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: ubuntu-latest
            cmd: dist:linux
          - os: macos-latest
            cmd: dist:mac
          - os: windows-latest
            cmd: dist:win

    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - name: Build
        run: npm run ${{ matrix.cmd }}

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: installers-${{ matrix.os }}
          path: |
            dist/*.exe
            dist/*.dmg
            dist/*.AppImage
            dist/*.yml

      - name: Release
        if: startsWith(github.ref, 'refs/tags/')
        uses: softprops/action-gh-release@v2
        with:
          draft: true
          files: |
            dist/*.exe
            dist/*.dmg
            dist/*.AppImage
```

Notes:
- `fail-fast: false` so a Linux failure doesn't cancel the Windows
  build mid-flight.
- Releases are **drafts** so you can review artifacts and write release
  notes before publishing.
- The `*.yml` in artifact upload captures electron-builder's
  `latest.yml` / `latest-mac.yml` / `latest-linux.yml` update metadata
  files, which will be needed when auto-update is added later.
- No code signing secrets are configured. When signing is added, the
  workflow will need `CSC_LINK` + `CSC_KEY_PASSWORD` (Windows) and
  `CSC_LINK` + `CSC_KEY_PASSWORD` + `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD`
  + `APPLE_TEAM_ID` (macOS) as repository secrets.

### 6. `.gitignore` update

Add `dist/` to the existing `.gitignore` so built artifacts aren't
committed:

```
dist/
```

### 7. `README.md` update

Add a short "Installation" section near the top, above or replacing the
current "Run it" section:

```markdown
## Installation

### Download a release (recommended)
Grab the latest installer for your platform from
[Releases](../../releases):
- **Windows**: `Game Copilot Overlay Setup X.Y.Z.exe`
- **macOS**: `Game Copilot Overlay-X.Y.Z.dmg` (x64 or arm64)
- **Linux**: `Game-Copilot-Overlay-X.Y.Z.AppImage`

### Run from source
1. `npm install`
2. Set your provider key (see `.env.example`)
3. `npm start`
```

Keep the rest of the README unchanged.

## Acceptance criteria
1. `npm run dist` on each platform produces a working installer in
   `dist/` without errors.
2. Installing and launching the built app works identically to
   `npm start`: Alt+Space toggles the overlay, game detection runs,
   asking a question captures a screenshot and returns an LLM answer.
3. The GitHub Actions workflow runs on a `v*` tag push, builds on all
   three platforms, and creates a draft release with the installers
   attached.
4. `dist/` is gitignored.
5. No application logic changed — this is purely build/packaging
   infrastructure.

## Explicit non-goals for this pass
- **Code signing / notarization.** Windows will show SmartScreen
  warnings; macOS will show "unidentified developer" gatekeeper dialogs.
  Users can right-click → Open (macOS) or click "More info" → "Run
  anyway" (Windows). Document this in the README as a known limitation.
  Signing is a follow-up that requires paid certificates.
- **Auto-update.** `electron-updater` integration is a natural next step
  once releases are flowing, but it adds complexity (update server or
  GitHub Releases as update feed, differential downloads, rollback) that
  should be its own spec.
- **Snap / Flatpak / deb / rpm.** AppImage covers the "just download and
  run" case. Distro-specific packages can be added later if there's
  demand.
- **Custom installer UI.** NSIS one-click is intentional — fewer moving
  parts, fewer things to break.
- **Icon artwork.** Placeholders only. Real icons are a design task, not
  an engineering task.
