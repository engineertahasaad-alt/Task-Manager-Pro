---
name: Taskaya schema migration approach
description: drizzle-kit push fails without a TTY; use raw SQL + migrate.ts instead
---

## Rule

`drizzle-kit push` (even with `--force`) always needs an interactive TTY to resolve column conflicts. It throws `"Interactive prompts require a TTY terminal"` and exits in any non-interactive shell or code_execution sandbox.

**Why:** The drizzle-kit binary prompts for column-rename vs. drop-and-add decisions even when `--force` is set.

**How to apply:**
- When schema changes are needed from the agent, apply them as raw SQL via the `executeSql` code_execution callback.
- `artifacts/api-server/src/migrate.ts` is the canonical migration source — it runs idempotent `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` on every server startup. Keep it up to date when the Drizzle schema changes.
- After raw SQL migration, always verify with `pnpm --filter @workspace/db run push` in the Replit shell (the user can do this interactively).
- Ensure unique constraints are added manually if the `CREATE TABLE` used by migrate.ts declares them — `ON CONFLICT (col)` in later SQL fails with `42P10` if the constraint doesn't exist yet.
