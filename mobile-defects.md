# Mobile Defects & Roadmap Checklist (Podman Ban)

> Persian simple language. Generated from code review + Graphify. No code changes made.

## Phase 0 — Audit (بدون تغییر کد)
- [ ] on-device audit `isNativeApp` on Samsung / Xiaomi / Pixel
- [ ] before/after table for timer notification freeze
- [ ] battery probe 24h baseline
- [ ] permission flow test allow/deny/settings
- [ ] offline deep route fallback test
- [ ] capture crash baseline + load p95

## Phase 1 — Reliability هسته (P0)
- [ ] Back button handler + exam exit confirm consumption
- [ ] Study timer Foreground Service + notification channels
- [ ] Daily reminder native alarm / FCM scheduled
- [ ] Permission denied → settings deep-link
- [ ] normalized native detection (one source) + safety audit

## Phase 2 — Durable Data & Offline (P1)
- [ ] durable sync queue (answers, study act events)
- [ ] offline cache for overview/leaderboard snapshots
- [ ] visibility-gated polling + adaptive intervals
- [ ] online status probe consolidation (one interval)
- [ ] OAuth cold-start deep-link ticket handler

## Phase 3 — Native Polish (P2)
- [ ] keyboard plugin + resize policy
- [ ] haptics on timer thresholds
- [ ] notification deep-link to exact view
- [ ] widgets daily goal
- [ ] adaptive icons raster + splash

## Phase 4 — Store readiness & Observability
- [ ] AAB + Play App Signing + targetSdk review
- [ ] permission/data safety docs + privacy/account deletion
- [ ] crash analytics end-to-end verified
- [ ] pre-launch test matrix (Android 12-15)
- [ ] performance profiling low-end devices

## Additional Defects (otherwise easy to miss)
- Service Worker registration is delayed until `window.load` (could slow PWA installability)
- PWA has no `beforeinstallprompt` helper/button
- Service Worker offline fallback caches only `/` (deep routes broken)
- OAuth cold-start ticket may be missed
- theme-color fixed light-only
- portrait-only manifest may limit tablet UX
- admin broadcast only polls every 60s
- polling traffic (online status 30s + rooms 10s + config/broadcast 60s)
- permission denied has no settings deep-link
- `isNativeApp()` duplicated in api-client + native-notify
- auth refresh edge cases on flaky mobile network
- no account deletion/data safety endpoint visible
- anti-tamper signature guard can break updates if signing changes
- base64 upload memory overhead
- crash analytics end-to-end not clearly verified
- exam answers durability on weak network needs durable queue
- keyboard may hide inputs in forms
- back-swipe accidental exit in exam
- daily reminders via setTimeout only while app alive
- timer notification freezes while process killed
- native detection fragility in APKs

## Simple Before/After (one-line)
- Exit confirm: before back-swipe closes exam; after asks confirmation
- Reminder: before never at 23:00 if killed; after fires daily
- Timer notif: before frozen time; after live update
- Weak network answers: before lost; after safe resend
- Battery: before constant poll; after adaptive/gated
- Keyboard: before hidden inputs; after auto-scroll
- Permissions: before no retry path; after settings deep-link
- Cold-start OAuth: before ticket missed; after handled
- Offline: before blank nested routes; after fallback/guidance
- Install: before manual; after guided

## Metrics
- Crash-free sessions > 99.5%
- App start p95 < 3.5s
- Notification delivery >= 95%
- Reminder fire rate >= 98%
- Pending answer loss = 0
- Background API traffic -40%
- Permission opt-in >= 80%