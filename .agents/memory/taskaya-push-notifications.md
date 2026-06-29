---
name: Taskaya push notifications
description: Why Android system push fails on the Taskaya mobile build, and the in-app realtime pattern that works over OTA.
---

## Android system notifications need FCM + a rebuild (NOT OTA-fixable)
Symptom: the Taskaya Android app shows no system notification at all — no sound, no banner — while in-app notifications work.

**Root cause:** the Expo app has no Firebase Cloud Messaging configuration — there is no `google-services.json` and no `android.googleServicesFile` in `app.json`. On a standalone/preview Android build (`credentialsSource: remote`), `getExpoPushTokenAsync()` cannot obtain a native token, so the device never registers any push token. Confirmed on 2026-06-29: the production `push_tokens` table had ZERO rows for every platform.

**Why:** FCM credentials and `google-services.json` are baked into the native binary at build time. `eas update` (OTA) cannot add them.

**How to fix (requires the user's Google/Firebase account):**
1. Create a Firebase project + Android app with package `com.taskaya.app`; download `google-services.json` into `artifacts/taskflow-mobile/`.
2. Add `"googleServicesFile": "./google-services.json"` to `expo.android` in `app.json`. (Do NOT add this reference before the file exists — `eas build` fails with ENOENT. It does NOT affect `eas update`.)
3. Upload the FCM **V1** service-account key to EAS so Expo's servers can call FCM. The `eas credentials` CLI only does this via an interactive arrow-key menu (no non-interactive flag), and mis-navigating it risks the build keystore. Safer: do it via the EAS GraphQL API (`https://api.expo.dev/graphql`, `Authorization: Bearer $EXPO_TOKEN`) — query `app.byFullName(@owner/slug){ id ownerAccount{id} androidAppCredentials(filter:{applicationIdentifier}){ id googleServiceAccountKeyForFcmV1{id} } }`, then `createGoogleServiceAccountKey(googleServiceAccountKeyInput:{jsonKey:<full SA json object>}, accountId)` → `setGoogleServiceAccountKeyForFcmV1(id:<androidAppCredentialsId>, googleServiceAccountKeyId:<keyId>)`. EAS projectId == the App node id. Build the request body with `jq --slurpfile` so the private key never hits stdout, and delete the SA json from the repo afterward (it is NOT gitignored).
4. Run a NEW build (`eas build -p android --profile preview`) and install it. Only then will tokens register and system notifications arrive.

## EAS build-credits blocker (account-level, not code)
`eas build` can accept an upload and show the build as `in progress` while it is actually queued behind exhausted credits — the CLI prints "You've reached your included build credits this billing period. New builds are blocked until your billing period resets." So `in progress` does NOT mean it will finish. Completion is gated by Expo billing (`expo.dev/accounts/<owner>/settings/billing`); nothing in the repo can unblock it — the owner must upgrade or wait for the period reset. When verifying a build, check the billing/credits line in the build log, not just the build status.

## In-app realtime (OTA-shippable, already done)
The notifications list felt stale / needed a tab close+reopen because the list query had no polling and nothing refreshed it on push receipt. Working pattern:
- `useListNotifications({ query: { queryKey: getListNotificationsQueryKey(), refetchInterval, refetchOnMount: 'always' } })` on the screen; badge poller in `_layout.tsx` also polls.
- A foreground `Notifications.addNotificationReceivedListener` that invalidates `getListNotificationsQueryKey()` for instant update once push works.

## Server push hygiene
Expo's `exp.host/--/api/v2/push/send` returns HTTP 200 even when a message fails — the real error is in the response body ticket (`data.status === 'error'`, `data.details.error`). Always parse the body, log ticket errors, and delete tokens on `DeviceNotRegistered`. Checking only `res.ok` silently swallows every delivery failure.
