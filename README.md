# flutter-appstore-screenshots

A CLI that creates Google Play and Apple App Store screenshots from an existing Flutter app. It loads your Flutter **web** build in headless Chromium (Playwright), sets the viewport and pixel ratio for each store device size, and saves PNGs whose pixel dimensions match store requirements exactly.

## Prerequisites

- Node 20+ (tested on 22)
- Your Flutter app must build for web (`flutter build web`). Flutter 3.35.5 is used in the CI example.
- Chromium for Playwright: `npx playwright install chromium`

## Quick start (local)

```bash
npm install && npm run build && npx playwright install chromium

# in your Flutter project
flutter build web --release --pwa-strategy none

# in this repo
node dist/cli.js init                      # writes screenshots.config.json
# edit webDir (e.g. ../my_app/build/web) and screens
node dist/cli.js capture
```

Or let the tool build for you: set `flutterProject` in the config and run `capture --build`.

### URL mode

```bash
cd my_app && flutter run -d web-server --web-port 8080
node dist/cli.js capture --url http://localhost:8080
```

### Commands

- `list-devices`: print presets with store and pixel sizes
- `init [--out file]`: write an example config
- `capture [--config f] [--url u] [--web-dir d] [--device names...] [--out dir] [--build]`

Output goes to `<outDir>/<apple|google>/<device>/<locale>/<NN>-<name>.png`.

## Config reference (`screenshots.config.json`)

| Key | Description |
| --- | --- |
| `url` / `webDir` / `flutterProject` | One is required. `webDir` is served by a built-in static server with SPA fallback. `flutterProject` defaults `webDir` to `<project>/build/web`. |
| `outDir` | Output directory, default `screenshots` |
| `devices` | Preset names, default all |
| `locales` | Browser locales, default `["en-US"]` |
| `readySelector` | Element that signals the app loaded, default `flt-glass-pane, flutter-view` |
| `settleMs` | Delay after load, default 1500 |
| `enableSemantics` | Click `flt-semantics-placeholder` so text and buttons can be found by text |
| `screens[]` | `name`, `path` (`#/settings` or `/settings`), `waitFor` (ms or selector), `theme` (`light`/`dark`), `actions` |

Actions: `{"click": "Label or CSS selector"}`, `{"clickAt": [x, y]}` (CSS pixels), `{"type": "selector", "text": "..."}`, `{"scroll": 400}`, `{"wait": 500}`.

## Device sizes

| Preset | Store | Pixels | Viewport @scale |
| --- | --- | --- | --- |
| iphone-6.9 | Apple | 1320x2868 | 440x956 @3x |
| iphone-6.5 | Apple | 1284x2778 | 428x926 @3x |
| iphone-5.5 | Apple | 1242x2208 | 414x736 @3x |
| ipad-13 | Apple | 2064x2752 | 1032x1376 @2x |
| ipad-12.9 | Apple | 2048x2732 | 1024x1366 @2x |
| play-phone | Google | 1080x1920 | 360x640 @3x |
| play-tablet-7 | Google | 1200x1920 | 600x960 @2x |
| play-tablet-10 | Google | 1600x2560 | 800x1280 @2x |
| play-feature-graphic | Google | 1024x500 | 1024x500 @1x |

Check the current requirements in App Store Connect and Play Console; Apple generally needs only the largest iPhone and iPad sizes and scales them down.

## Tips for Flutter web

- Flutter renders to a canvas (CanvasKit), so text is not in the DOM. Set `enableSemantics: true` to click by label, or use `clickAt` coordinates.
- Use hash routes (`#/settings`) so each screen can be opened by URL. Path routes work through the SPA fallback.
- Increase `settleMs` or `waitFor` if fonts or images load late.
- Use mock or demo data in the app for clean screenshots.

## Limitations

Web rendering differs slightly from native (fonts, status bar, platform widgets, plugins that need native code). There is no device frame or caption. For pixel-perfect native output, use Flutter `integration_test` screenshots or golden tests instead.

## CI

`.github/workflows/screenshots.yml` is a manual workflow. It checks out this tool and your Flutter app repo (input `app_repo`, optional `app_ref`), builds web with Flutter 3.35.5, runs the capture, and uploads `screenshots/` as an artifact.

## Development

```bash
npm run build && npm test
node dist/cli.js capture --config examples/screenshots.config.json   # smoke test with examples/demo-app
```
