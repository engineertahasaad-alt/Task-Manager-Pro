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

## Publishing an OTA update reliably from this workspace

`eas update --channel <ch>` is the OTA path (no APK rebuild). Two non-obvious blockers:

- **eas-cli version:** the nix-provided `eas-cli` (14.x) silently fails/exits with a
  0-byte log when bundling an SDK 54 project — the project pins `cli.version >= 16.0.0`
  for this reason. Use a satisfying CLI via `npx --yes eas-cli@latest update ...`.
- **Process lifetime:** the export+upload takes ~3–5 min. The bash tool caps at 120s
  (foreground times out and the job dies), and detached background jobs proved
  unreliable here. Run it as a **managed workflow** (`configureWorkflow`, outputType
  "console", no waitForPort, autoStart) so it isn't reaped; monitor via the log file,
  then `removeWorkflow` when `OTA_EXIT=0`. Verify with
  `eas channel:view preview --json` (expect non-empty `updateGroups`). `EXPO_TOKEN`
  secret must be set; runtimeVersion policy is `sdkVersion` (`exposdk:54.0.0`).

**Dev vs prod DB:** development and the deployed app use SEPARATE databases (the
runtime-managed `DATABASE_URL` resolves differently per environment). A row created by
hitting the deployed backend is NOT visible in the dev DB, and `executeSql`
`environment: "production"` is read-only — you cannot delete prod rows via tooling.
