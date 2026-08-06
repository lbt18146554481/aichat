# Maitri iOS Build Guide

This document explains how to build, sign, and submit the Maitri iOS app from the `native/ios` directory.

## Important Constraints

- **Lovable cannot compile iOS for you.** Apple requires signing, Archive, and App Store Connect upload to be performed on a Mac with Xcode and an active Apple Developer account.
- The web source lives in `src/`; the iOS shell lives in `native/ios`. Everything under `native/` is independent of the web build pipeline and can be copied to another machine or repository.
- The iOS app embeds the static web bundle (`native/www`) directly, so it works offline and does not simply load a remote URL.

## One-Time Setup

1. **macOS + Xcode**: Install the latest Xcode from the Mac App Store or Apple Developer portal.
2. **Apple Developer account**: Enroll in the Apple Developer Program (US$99/year). You need it to sign and upload.
3. **Node / Bun**: Install the same package manager used by the web project (Bun is recommended).
4. **CocoaPods**: Capacitor uses CocoaPods. Run `sudo gem install cocoapods` if you haven't already.

## Quick Build (Same Repository)

```bash
# 1. Install dependencies
bun install

# 2. Build the static web bundle into native/www
bun run native:build

# 3. Sync Capacitor plugins and regenerate the iOS project
bun run ios:sync

# 4. Open Xcode
bun run ios:open
```

In Xcode:

- Select a **Development Team** in the Signing & Capabilities tab.
- Choose a real iPhone or the **Any iOS Device (arm64)** destination.
- Press **Product → Archive** to build the `.ipa`.
- Use **Distribute App** to upload to App Store Connect / TestFlight.

## Fully Splitting the iOS Project

If you prefer to manage the iOS project in its own repository:

```bash
cp -R native /path/to/new-maitri-ios-repo/
```

Inside the new repository:

```bash
cd /path/to/new-maitri-ios-repo/native
# Install only the Capacitor CLI if you don't have the full web dependencies
bun add -D @capacitor/cli
bunx cap sync ios
open ios/App/App.xcworkspace
```

`native/ios` only depends on `native/www`. Once you copy the directory, any future frontend update must be reflected by rebuilding `native/www` and copying it in.

## Version and Build Number

Both platforms derive their release identity from one generator, so a shipped
`.ipa` and a deployed web build can be traced to the same commit.

| Field | Source | Web | iOS |
| --- | --- | --- | --- |
| Marketing version | `package.json` `version` | `<meta name="x-app-version">` | `MARKETING_VERSION` |
| Build number | git commit count (`BUILD_NUMBER` env overrides) | `<meta name="x-app-build">` | `CURRENT_PROJECT_VERSION` |
| Commit + release id | short git sha | `<meta name="x-app-release">` | `MAITRI_RELEASE_ID` |

```bash
bun run version:sync    # regenerate both artifacts
bun run version:check   # CI guard: Web and iOS must agree
```

Generated artifacts (committed, never hand-edited):

- `src/lib/build-info.generated.ts` — imported by the web and native bundles
- `native/ios/version.xcconfig` — used by both Xcode configurations; `debug.xcconfig` includes it

`build`, `build:dev`, `native:build`, and `ios:sync` run the generator first, so
Xcode always archives the same version the bundle reports.

To cut a release: bump `version` in `package.json`, run `bun run version:sync`,
commit, then `bun run native:build && bun run ios:sync`. For a re-upload of the
same commit, set `BUILD_NUMBER=<n>` before syncing (App Store Connect rejects a
duplicate build number).

## URL Scheme for OAuth

The bundle identifier is `app.lovable.maitri`. The custom URL scheme is `maitri://`. If you later wire real OAuth, the provider redirect should be `maitri://auth/callback` and the web route `/auth/callback` should handle the token.

You can verify the scheme is registered in `native/ios/App/App/Info.plist` under `CFBundleURLTypes`.

## App Store Review Checklist

- **Privacy Policy URL**: Required because the app has accounts and profiles. Host it on a public page before submission.
- **App Privacy Declaration**: Declare contact info (name, email, photo if uploaded), user content, and identifiers.
- **Screenshots**: iPhone 6.7" and 6.5" plus iPad if universal.
- **Demo Account**: Provide an Apple test account if you use Sign in with Apple.
- **Invite Code**: Since v1 registration requires an invite code, include a working demo invite code in the review notes so the reviewer can complete signup.
- **Sign in with Apple**: If you offer Google/Apple/WeChat, Apple is mandatory. The web auth screen already includes Apple, which satisfies this rule.
- **4.2 Minimum Functionality**: The app must be more than a repackaged web page. Maitri is a full matchmaking/connection app; the native shell adds status bar, safe-area, splash screen, and native back gesture, which Apple generally accepts.

## Common Issues

- **CocoaPods not found**: `sudo gem install cocoapods` or `brew install cocoapods`.
- **Signing errors**: Open Xcode, select your team, and let Xcode manage provisioning profiles.
- **Missing `native/www`**: Run `bun run native:build` first. `npx cap sync ios` will fail if the directory is empty.
- **App opens to white screen**: Check the WebView inspector in Safari → Develop menu to see console errors. Usually the static bundle failed to build.

## Releasing a Web Update Without Rebuilding the App

Because the app embeds the bundle, every web change requires a new app release. If you want live updates in the future, evaluate Capacitor Live Updates (paid) or add an in-app update prompt that routes the user to the App Store. This is not configured in the current version.
