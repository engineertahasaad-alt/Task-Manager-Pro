import { pool } from "@workspace/db";
import { logger } from "./lib/logger";

export async function runMigrations() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS teams (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        invite_code TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        team_id INTEGER REFERENCES teams(id),
        full_name TEXT NOT NULL,
        mobile TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'deputy', 'member')),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        team_id INTEGER REFERENCES teams(id),
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        assignee_id INTEGER NOT NULL REFERENCES users(id),
        creator_id INTEGER NOT NULL REFERENCES users(id),
        deadline TIMESTAMPTZ NOT NULL,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'approved', 'reopened')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS attachments (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        sender_id INTEGER NOT NULL REFERENCES users(id),
        content TEXT NOT NULL,
        attachment_url TEXT,
        attachment_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('task_assigned', 'deadline_approaching', 'task_completed', 'task_approved', 'task_reopened')),
        message TEXT NOT NULL,
        task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS push_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL,
        platform TEXT NOT NULL CHECK (platform IN ('expo', 'web')),
        subscription JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, token)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS webauthn_credentials (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        credential_id TEXT NOT NULL UNIQUE,
        public_key TEXT NOT NULL,
        counter INTEGER NOT NULL DEFAULT 0,
        transports JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reassign_to_id INTEGER REFERENCES users(id);`);
    await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reassign_from_id INTEGER REFERENCES users(id);`);
    await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reassign_status TEXT CHECK (reassign_status IN ('pending', 'approved', 'rejected'));`);
    await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reminder_24h_sent BOOLEAN NOT NULL DEFAULT FALSE;`);
    await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reminder_1h_sent BOOLEAN NOT NULL DEFAULT FALSE;`);
    await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reminder_10m_sent BOOLEAN NOT NULL DEFAULT FALSE;`);
    await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS overdue_reminder_sent BOOLEAN NOT NULL DEFAULT FALSE;`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_approval BOOLEAN NOT NULL DEFAULT FALSE;`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_reminder_24h BOOLEAN NOT NULL DEFAULT TRUE;`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_reminder_1h BOOLEAN NOT NULL DEFAULT TRUE;`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_reminder_10m BOOLEAN NOT NULL DEFAULT TRUE;`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_overdue BOOLEAN NOT NULL DEFAULT TRUE;`);

    // Phase 2: group_memberships junction table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS group_memberships (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        group_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'deputy', 'member')),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        pending_approval BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, group_id)
      );
    `);

    // Migrate existing users: insert a group_memberships row for every user that has a team_id
    await pool.query(`
      INSERT INTO group_memberships (user_id, group_id, role, is_active, pending_approval, created_at)
      SELECT
        u.id,
        u.team_id,
        u.role,
        u.is_active,
        u.pending_approval,
        u.created_at
      FROM users u
      WHERE u.team_id IS NOT NULL
      ON CONFLICT (user_id, group_id) DO NOTHING;
    `);

    // Phase 2b: task_assignees junction table for multi-assignee support
    await pool.query(`
      CREATE TABLE IF NOT EXISTS task_assignees (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (task_id, user_id)
      );
    `);

    // Migrate existing tasks: populate task_assignees from assignee_id
    await pool.query(`
      INSERT INTO task_assignees (task_id, user_id, assigned_at)
      SELECT id, assignee_id, created_at
      FROM tasks
      WHERE assignee_id IS NOT NULL
      ON CONFLICT (task_id, user_id) DO NOTHING;
    `);

    // Drop legacy assignee_id column now that task_assignees is the source of truth
    // We first need to drop any FK constraint referencing assignee_id, then the column itself
    await pool.query(`
      DO $$
      DECLARE
        constraint_name text;
      BEGIN
        SELECT tc.constraint_name INTO constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name = 'tasks'
          AND kcu.column_name = 'assignee_id'
        LIMIT 1;

        IF constraint_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE tasks DROP CONSTRAINT %I', constraint_name);
        END IF;
      END;
      $$;
    `);
    await pool.query(`ALTER TABLE tasks DROP COLUMN IF EXISTS assignee_id;`);

    await initVapidKeys();

    logger.info("Migrations completed");
  } catch (err) {
    logger.error({ err }, "Migration failed");
    throw err;
  }
}

async function initVapidKeys() {
  try {
    const result = await pool.query<{ value: string }>(
      "SELECT value FROM config WHERE key = 'vapid_public' LIMIT 1"
    );
    if (result.rows.length > 0) return;

    const webpush = await import("web-push");
    const keys = webpush.generateVAPIDKeys();
    await pool.query(
      "INSERT INTO config (key, value) VALUES ($1, $2), ($3, $4) ON CONFLICT (key) DO NOTHING",
      ["vapid_public", keys.publicKey, "vapid_private", keys.privateKey]
    );
    logger.info("VAPID keys generated");
  } catch (err) {
    logger.warn({ err }, "Could not init VAPID keys");
  }
}
