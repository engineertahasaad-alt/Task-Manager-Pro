---
name: Taskaya mobile API domain resolution
description: How the Expo app resolves its backend URL across dev, release builds, and OTA updates
---

# Taskaya mobile — backend API domain

All backend calls in `artifacts/taskflow-mobile` resolve their host through a single
module: `lib/config.ts`, exporting `API_DOMAIN` and `API_BASE_URL`. Every screen/context
imports from there — do NOT reintroduce raw `process.env.EXPO_PUBLIC_DOMAIN` reads.

`API_DOMAIN = process.env.EXPO_PUBLIC_DOMAIN || PRODUCTION_DOMAIN` where `PRODUCTION_DOMAIN`
is a hardcoded constant set to the published Replit Deployment domain.

**Why the hardcoded fallback is mandatory:** `eas update` (OTA) does NOT read the `env`
block from `eas.json` build profiles. Only the local shell env / EAS dashboard env vars
are available at update-bundle time. So an OTA bundle can ship with `EXPO_PUBLIC_DOMAIN`
undefined; without the fallback the app would build URLs like `https://undefined/api/...`.
Release builds also must not point at the ephemeral `*.kirk.replit.dev` workspace domain —
that only resolves while the workspace tab is open, which is why installed APKs showed
"No internet" + "Signup failed" (every fetch was hitting a dead host).

**How to apply:** local dev keeps working because the `dev` script injects
`EXPO_PUBLIC_DOMAIN`. For anything users install, the fallback must be the permanent
deployed backend domain. The mobile app talks to the api-server, which mounts routes at
`/api` and is the externalPort-80 service, so it lives at the root of the deployment domain.
