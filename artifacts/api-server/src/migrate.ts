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
    await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reassign_status TEXT CHECK (reassign_status IN ('pending', 'approved', 'rejected'));`);
    await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reminder_24h_sent BOOLEAN NOT NULL DEFAULT FALSE;`);
    await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reminder_1h_sent BOOLEAN NOT NULL DEFAULT FALSE;`);
    await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reminder_10m_sent BOOLEAN NOT NULL DEFAULT FALSE;`);
    await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS overdue_reminder_sent BOOLEAN NOT NULL DEFAULT FALSE;`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_approval BOOLEAN NOT NULL DEFAULT FALSE;`);

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
