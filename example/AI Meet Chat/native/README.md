# Maitri Native

This folder contains everything that is not shared with the web build:

- `ios/` — Xcode/Capacitor iOS project
- `android/` — future Android project
- `www/` — embedded static web bundle consumed by iOS/Android
- `scripts/` — build scripts for the native bundle
- `docs/` — platform-specific guides
- `resources/` — source icon and splash-screen images

## Rules

- **Business logic and UI stay in `src/`**. The native layer is only a shell.
- **Web components never import from `@capacitor/*` directly**. They use `src/lib/platform` instead.
- **Only `src/native-entry.tsx` and `src/lib/platform/bridge.ts` are allowed to dynamically import Capacitor plugins.**
- **This directory is not compiled by the web Vite pipeline.** It is excluded from `tsconfig.json` and `eslint.config.js`.

## Build

```bash
bun run native:build   # outputs to native/www
bun run ios:sync       # sync plugins and bundle into native/ios
bun run ios:open       # open Xcode
```

See `docs/ios-build.md` for App Store submission details.
