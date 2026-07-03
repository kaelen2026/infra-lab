---
name: ios-simulator-qa
description: >-
  Build apps/ios, install & launch it on an iOS Simulator, then drive the real UI from the
  CLI — tap/swipe via cliclick with a screen-coordinate mapping derived from CGWindowList —
  and verify each step with simctl screenshots. Use when asked to 模拟器跑一下 / 装到模拟器 /
  验证 iOS 效果 / QA an iOS feature end-to-end, without Xcode UI tests or manual clicking.
---

# ios-simulator-qa

Runtime verification loop for the iOS client (`apps/ios`, scheme `InfraAuth`, bundle id
`ai.deeplang.infra.ios`): build → install → launch → drive the UI → screenshot-assert.
Everything runs headless from the CLI; the only human-granted prerequisite is Accessibility
permission for the host terminal (needed by `cliclick`).

## Facts (verified 2026-07)

- Default destination is **iPhone 17 Pro** (`apps/ios/Makefile` `DESTINATION`), logical size
  **402×874 pt @3x** → `simctl` screenshots are 1206×2622 px; **device pt = screenshot px ÷ 3**.
- With no `API_URL` override the app calls `http://localhost:3001` — the dev API must be up
  (`curl localhost:3001/ready` must show db+redis ok). Start it with `pnpm dev:api` if needed.
- Login: with `OTP_DEBUG_RETURN_CODE=true` in `.env`, the app **displays the debug OTP code on
  the code-entry screen** — any phone number can log in unattended.
- The Keychain token survives app reinstalls: after the first login, rebuilding + reinstalling
  keeps the session (no re-login needed per iteration).
- `xcrun simctl io <udid> screenshot` needs **no host permissions**. Do NOT reach for
  `screencapture` (Screen Recording permission) or System-Events AppleScript (Accessibility
  denied for `osascript`) — both fail in this environment; the tools below are sufficient.

## 1 · Build, install, launch

```bash
cd apps/ios && make build                      # XcodeGen + xcodebuild, simulator Debug build
APP=$(xcodebuild -project InfraAuth.xcodeproj -scheme InfraAuth \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -showBuildSettings 2>/dev/null \
  | sed -n 's/^ *TARGET_BUILD_DIR = //p')/InfraAuth.app   # don't hardcode the DerivedData hash

SIM=$(xcrun simctl list devices available | sed -n 's/.*iPhone 17 Pro (\([0-9A-F-]*\)).*/\1/p' | head -1)
xcrun simctl boot "$SIM" 2>/dev/null; open -a Simulator
xcrun simctl terminate "$SIM" ai.deeplang.infra.ios 2>/dev/null   # kill the old build first
xcrun simctl install "$SIM" "$APP"
xcrun simctl launch "$SIM" ai.deeplang.infra.ios
```

Screenshot at any point (then Read the png to inspect):

```bash
xcrun simctl io "$SIM" screenshot /path/to/shot.png
```

## 2 · Map device points → host screen coordinates

`cliclick` clicks in **global host-screen coordinates**, so first locate the Simulator window.
CGWindowList needs no permissions — run this Swift snippet:

```swift
// winbounds.swift — prints the Simulator device window's global frame
import CoreGraphics
import Foundation
let info = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements],
                                      kCGNullWindowID) as? [[String: Any]] ?? []
for w in info {
    guard let owner = w[kCGWindowOwnerName as String] as? String, owner == "Simulator",
          let b = w[kCGWindowBounds as String] as? [String: CGFloat],
          let layer = w[kCGWindowLayer as String] as? Int, layer == 0 else { continue }
    print("x=\(b["X"]!) y=\(b["Y"]!) w=\(b["Width"]!) h=\(b["Height"]!)")
}
```

With window `(winX, winY, winW, winH)` and a target read off a `simctl` screenshot in device
points `(ptX, ptY)` (= px ÷ 3):

```
titleBar = 28
scale    = (winH - titleBar) / 874          # device logical height
marginX  = (winW - 402 * scale) / 2         # window is slightly wider than the screen
screenX  = winX + marginX + ptX * scale
screenY  = winY + titleBar + ptY * scale
```

These constants were verified empirically (window 456×972 → scale ≈ 1.08, marginX ≈ 11).
**Always confirm the first tap with a screenshot before chaining more actions** — if it
missed, recompute rather than nudging blindly.

## 3 · Drive the UI with cliclick

`brew install cliclick` if missing. It needs Accessibility permission for the host terminal;
probe with `cliclick p` (prints the pointer position when allowed) and ask the user to grant
it in System Settings if not. Bring the window forward first: `open -a Simulator`.

```bash
cliclick c:X,Y                                        # tap
cliclick dd:X1,Y dm:…,Y dm:…,Y du:X2,Y                # swipe/drag as a press-move-release chain
```

- Horizontal page swipe (e.g. image viewer): ~250 px travel with 3–4 `dm` points works.
- Vertical dismiss (e.g. swipe-down-to-close): start near the content's top, travel ~400 px.
- Screenshot after every gesture; SwiftUI animations mean a shot taken <1 s after a gesture
  can catch a mid-transition frame — `sleep 1.5` before the screenshot, and treat a
  half-transitioned frame as "in progress", not failure.
- Text entry: tap the field first, then `cliclick t:'text'` types into the focused control
  (the simulator routes host keystrokes).

## 4 · Seed test data through the API

Fixtures go through the real API, not the DB, so validation and side effects stay honest.
Get a session either by logging in on the simulator (debug OTP shown in-app) or by replaying a
known dev cookie/Bearer token with curl. Examples used for the timeline features:

```bash
# text posts (pagination fixtures)
curl -X POST localhost:3001/timeline -b "$COOKIE" -H 'content-type: application/json' \
  -d '{"text":"分页测试 1"}'
# image post (viewer fixtures) — crop throwaway JPEGs from any png via sips, no ImageMagick/PIL
sips -s format jpeg -c 800 800 --cropOffset 300 100 some.png --out pic1.jpg
url=$(curl -X POST localhost:3001/timeline/images -b "$COOKIE" \
  -F 'file=@pic1.jpg;type=image/jpeg' | python3 -c 'import sys,json;print(json.load(sys.stdin)["image"]["url"])')
curl -X POST localhost:3001/timeline -b "$COOKIE" -H 'content-type: application/json' \
  -d "{\"text\":\"图片测试\",\"images\":[{\"url\":\"$url\"}]}"
```

Never log/echo OTP codes or tokens into committed files; cookies above live only in the shell.

## 5 · Report

End with: what was exercised (each gesture/flow), a screenshot per verified state, and any
frame that looked off. Clean up seeded fixtures via `DELETE /timeline/:id` if the user asks.
