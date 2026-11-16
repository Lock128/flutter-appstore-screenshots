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

### Scripts (minimal parameters)

The scripts in `scripts/` install dependencies, build the tool and install Chromium when needed, then capture all device sizes in light and dark mode. No config file is required.

```bash
scripts/screenshots.sh http://localhost:8080          # running app, only the URL
scripts/screenshots-dir.sh my_app/build/web           # built web directory
scripts/screenshots-local.sh ../my_app                # runs flutter build web, then captures
npm run screenshots -- http://localhost:8080          # same as the first line
```

Each script takes an optional output directory as the last argument (default `./screenshots` in your current directory). Without a config the scripts capture a single `home` screen. Set `SCREENSHOTS_CONFIG` to use your own config for multiple screens.

| Env variable | Meaning |
| --- | --- |
| `DEVICES` | Space separated presets, e.g. `"iphone-6.9 play-phone"` (default all) |
| `THEME` | `light`, `dark` or `both` (default: the config `theme`, else `light`; when set it overrides the config) |
| `OUT_DIR` | Output directory (default `screenshots`) |
| `SCREENSHOTS_CONFIG` | Path to a config file |
| `SCREENSHOT_USER`, `SCREENSHOT_PASSWORD` | Credentials for `${...}` placeholders in a config `login` |

The CLI also runs without a config file when you pass `--url` or `--web-dir` and no `screenshots.config.json` exists. It then captures a `home` screen on all devices with `enableSemantics` on.

### Commands

- `list-devices`: print presets with store and pixel sizes
- `init [--out file]`: write an example config
- `capture [--config f] [--url u] [--web-dir d] [--device names...] [--out dir] [--theme light|dark|both] [--build]`

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
| `theme` | `light` (default), `dark` or `both`. See [Light and dark mode](#light-and-dark-mode) |
| `login` | Sign-in settings for screens that need it. See [Screens that need a login](#screens-that-need-a-login) |
| `screens[]` | `name`, `path` (`#/settings` or `/settings`), `waitFor` (ms or selector), `theme` (`light`/`dark`, overrides the global setting), `requiresLogin` (boolean), `actions` |

Actions: `{"click": "Label or CSS selector"}`, `{"clickAt": [x, y]}` (CSS pixels), `{"type": "selector", "text": "..."}`, `{"scroll": 400}`, `{"wait": 500}`.

## Light and dark mode

The tool sets the browser color scheme (`prefers-color-scheme`), which Flutter reads as the system brightness.

- Global: `"theme": "light" | "dark" | "both"` in the config, or `--theme` on the command line (the flag wins).
- Per screen: `"theme": "dark"` on a screen overrides the global value and captures only that theme.
- With `both`, every screen is captured twice and the files get a suffix: `01-home-light.png`, `01-home-dark.png`. With a single theme the file names have no suffix.

In your Flutter app, use `MaterialApp(themeMode: ThemeMode.system, theme: ..., darkTheme: ...)` so it follows the system brightness. If the app stores its own theme choice, the screenshots show that choice instead.

## Screens that need a login

Add a top-level `login` block and mark screens with `"requiresLogin": true`. Screens without it stay signed out. The tool signs in once per device, locale and theme (opens `login.path`, runs `login.actions`, waits for `login.waitFor`) and reuses that browser context for all login screens. Screens without `requiresLogin` use a fresh signed-out context.

```json
{
  "login": {
    "path": "#/login",
    "actions": [
      { "type": "input[aria-label='Email']", "text": "${SCREENSHOT_USER}" },
      { "type": "input[aria-label='Password']", "text": "${SCREENSHOT_PASSWORD}" },
      { "click": "Sign in" }
    ],
    "waitFor": 2000
  },
  "screens": [{ "name": "account", "path": "#/account", "requiresLogin": true }]
}
```

```bash
SCREENSHOT_USER=demo SCREENSHOT_PASSWORD=secret node dist/cli.js capture
```

| `login` key | Description |
| --- | --- |
| `path` | Page to open before the actions (default: app root) |
| `actions` | Same action types as screens. `${ENV_VAR}` is replaced in `click`, `type` and `text` values |
| `waitFor` | Milliseconds or selector to wait for after the actions |
| `storageState` | Path to a Playwright storage state JSON, relative to the config file (cookies, localStorage) for an already signed-in session. Use it instead of `actions` for SSO or token logins |
| `headers` | Extra HTTP headers, sent only to the app's own origin (never to CDNs or other hosts), e.g. `{"Authorization": "Bearer ${API_TOKEN}"}` |
| `allScreens` | Treat every screen as requiring login |

Notes:

- Credentials come from environment variables only. There are no `--password` flags, so nothing lands in shell history. A missing variable stops the run before the browser starts and the message names the variable, not any value.
- Login failures report only the failing action index, never the typed text.
- Do not commit credentials or storage state files. `auth.json` and `.auth/` are in `.gitignore`. Use a dedicated test account with demo data.
- Flutter web text fields live in the canvas. Set `enableSemantics: true` and target the semantics inputs (for example `input[aria-label='Email']`) or use `clickAt` followed by typing through selectors. Inspect your build in a browser to find the right selectors.
- After login the tool navigates to the screen path. A hash change keeps the app state, but a path change reloads the page, so the session must be persisted (cookies, localStorage, Firebase auth persistence, and so on).

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

`.github/workflows/screenshots.yml` is a manual workflow. It checks out this tool and your Flutter app repo (input `app_repo`, optional `app_ref`), builds web with Flutter 3.35.5, runs the capture, and uploads `screenshots/` as an artifact. Set repository secrets `SCREENSHOT_USER` and `SCREENSHOT_PASSWORD` (Settings, Secrets and variables, Actions) and the workflow passes them to the capture step for `login` configs. Secrets are masked in logs.

## Development

```bash
npm run build && npm test
node dist/cli.js capture --config examples/screenshots.config.json   # smoke test with examples/demo-app
```
