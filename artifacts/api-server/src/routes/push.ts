import { Router } from "express";
import { db, pushTokensTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { ensureVapidKeys } from "../lib/pushNotifications";
import { logger } from "../lib/logger";

const router = Router();

router.get("/push/vapid-public-key", async (_req, res): Promise<void> => {
  try {
    const { publicKey } = await ensureVapidKeys();
    res.json({ publicKey });
  } catch {
    res.status(500).json({ error: "Failed to get VAPID key" });
  }
});

router.post("/push/token", requireAuth, async (req, res): Promise<void> => {
  const { token, platform, webSubscription } = req.body;

  if (!token || !platform) {
    res.status(400).json({ error: "token and platform are required" });
    return;
  }

  if (!["expo", "web"].includes(platform)) {
    res.status(400).json({ error: "platform must be expo or web" });
    return;
  }

  try {
    await db
      .insert(pushTokensTable)
      .values({
        userId: req.user!.id,
        token,
        platform: platform as "expo" | "web",
        subscription: webSubscription ?? null,
      })
      .onConflictDoUpdate({
        target: [pushTokensTable.userId, pushTokensTable.token],
        set: {
          platform: platform as "expo" | "web",
          subscription: webSubscription ?? null,
          updatedAt: new Date(),
        },
      });

    res.json({ message: "Push token registered" });
  } catch (err) {
    logger.error({ err }, "Failed to register push token");
    res.status(500).json({ error: "Failed to register push token" });
  }
});

router.delete("/push/token", requireAuth, async (req, res): Promise<void> => {
  const { token } = req.body;

  if (!token) {
    res.status(400).json({ error: "token is required" });
    return;
  }

  try {
    await db
      .delete(pushTokensTable)
      .where(
        and(
          eq(pushTokensTable.userId, req.user!.id),
          eq(pushTokensTable.token, token)
        )
      );
    res.json({ message: "Push token removed" });
  } catch (err) {
    logger.error({ err }, "Failed to remove push token");
    res.status(500).json({ error: "Failed to remove push token" });
  }
});

export default router;
