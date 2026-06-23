import { db, pool } from "@workspace/db";
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
      ALTER TABLE users ADD COLUMN IF NOT EXISTS team_id INTEGER REFERENCES teams(id);
    `);

    await pool.query(`
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS team_id INTEGER REFERENCES teams(id);
    `);

    logger.info("Migrations completed");
  } catch (err) {
    logger.error({ err }, "Migration failed");
    throw err;
  }
}
