# Taskaya

A team task management PWA/mobile app that replaces WhatsApp/phone-call task assignments for small and medium teams.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/task-app run dev` — run the frontend (port 23220)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string, `SESSION_SECRET` — JWT secret

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind CSS, shadcn/ui, wouter routing, TanStack Query
- API: Express 5, JWT auth (jsonwebtoken + bcryptjs), multer for file uploads
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth)
- `lib/db/src/schema/` — Drizzle table definitions (users, tasks, attachments, messages, notifications)
- `artifacts/api-server/src/routes/` — Express route handlers (auth, users, tasks, attachments, messages, notifications, dashboard, reports)
- `artifacts/api-server/src/middlewares/auth.ts` — JWT auth middleware + role helpers
- `artifacts/api-server/uploads/` — Uploaded file storage (local)
- `artifacts/task-app/src/` — React frontend (pages, components)

## Architecture decisions

- JWT stored in localStorage under key `taskaya_token` (web) / `taskaya_token` in expo-secure-store (mobile); sent as `Authorization: Bearer <token>` header
- File uploads handled via multer directly (not in OpenAPI codegen — multipart/form-data breaks Orval's Node.js type generation)
- Task status flow: open → completed (by member) → approved (by manager/deputy) or reopened
- Notifications are created server-side on task state changes (assigned, completed, approved, reopened)
- Dashboard summary and workload computed on-the-fly from DB queries (no materialized views needed at this scale)

## Product

- Login with mobile number + password; first-login forced password change
- Three roles: Owner, Deputy (one per team), Member
- Simple task creation: title, description, assignee, deadline, optional attachments
- WhatsApp-style per-task chat with 3-second auto-polling
- Manager dashboard with stat cards and employee workload; Employee dashboard with today/upcoming/overdue
- PDF reports via browser print (daily and employee reports)

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Default password for new team members is `123` — they must change it on first login
- Seed owner credentials: mobile `0501234567`, password `owner123`
- All other seeded users: mobile is their number, password is `123` (must change on first login)
- `pnpm --filter @workspace/db run push-force` if schema push fails with column conflicts

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
