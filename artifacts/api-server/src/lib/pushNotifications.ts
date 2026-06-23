import webpush from "web-push";
import { db, pool } from "@workspace/db";
import { pushTokensTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

let vapidInitialized = false;

export async function ensureVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  try {
    const result = await pool.query(
      "SELECT key, value FROM config WHERE key IN ('vapid_public', 'vapid_private')"
    );
    const rows = result.rows as { key: string; value: string }[];
    const publicRow = rows.find(r => r.key === "vapid_public");
    const privateRow = rows.find(r => r.key === "vapid_private");

    if (publicRow && privateRow) {
      if (!vapidInitialized) {
        webpush.setVapidDetails(
          "mailto:admin@taskflow.app",
          publicRow.value,
          privateRow.value
        );
        vapidInitialized = true;
      }
      return { publicKey: publicRow.value, privateKey: privateRow.value };
    }

    const keys = webpush.generateVAPIDKeys();
    await pool.query(
      "INSERT INTO config (key, value) VALUES ($1, $2), ($3, $4) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
      ["vapid_public", keys.publicKey, "vapid_private", keys.privateKey]
    );

    webpush.setVapidDetails("mailto:admin@taskflow.app", keys.publicKey, keys.privateKey);
    vapidInitialized = true;
    return keys;
  } catch (err) {
    logger.error({ err }, "Failed to get/create VAPID keys");
    throw err;
  }
}

export async function sendPushToUser(userId: number, title: string, body: string, taskId?: number) {
  try {
    const tokens = await db
      .select()
      .from(pushTokensTable)
      .where(eq(pushTokensTable.userId, userId));

    for (const tokenRow of tokens) {
      if (tokenRow.platform === "expo") {
        await sendExpoPush(tokenRow.token, title, body, taskId);
      } else if (tokenRow.platform === "web" && tokenRow.subscription) {
        await sendWebPush(tokenRow.subscription as webpush.PushSubscription, title, body, taskId);
      }
    }
  } catch (err) {
    logger.error({ err, userId }, "Failed to send push notification");
  }
}

async function sendExpoPush(token: string, title: string, body: string, taskId?: number) {
  const message = {
    to: token,
    title,
    body,
    data: taskId ? { taskId } : {},
    sound: "default" as const,
    priority: "high" as const,
  };

  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
    if (!res.ok) {
      logger.warn({ token, status: res.status }, "Expo push failed");
    }
  } catch (err) {
    logger.error({ err, token }, "Expo push request failed");
  }
}

async function sendWebPush(
  subscription: webpush.PushSubscription,
  title: string,
  body: string,
  taskId?: number
) {
  try {
    await ensureVapidKeys();
    await webpush.sendNotification(
      subscription,
      JSON.stringify({ title, body, data: { taskId } })
    );
  } catch (err: any) {
    if (err.statusCode === 410) {
      logger.info("Web push subscription expired, should remove");
    } else {
      logger.error({ err }, "Web push failed");
    }
  }
}
