import app from "./app";
import { logger } from "./lib/logger";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function seedOwner() {
  try {
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.role, "owner"));
    if (!existing) {
      const passwordHash = await bcrypt.hash("owner123", 10);
      await db.insert(usersTable).values({
        fullName: "Owner",
        mobile: "0501234567",
        passwordHash,
        role: "owner",
        mustChangePassword: false,
      });
      logger.info("Seeded default owner account (mobile: 0501234567, password: owner123)");
    }
  } catch (err) {
    logger.warn({ err }, "Could not seed owner — DB may not be ready yet");
  }
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  await seedOwner();
});
