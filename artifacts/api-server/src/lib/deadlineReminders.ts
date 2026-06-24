import { db, tasksTable, notificationsTable } from "@workspace/db";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { sendPushToUser } from "./pushNotifications";
import { logger } from "./logger";

const ACTIVE_STATUSES = ["open", "reopened"] as const;

async function checkAndSend(
  windowMs: number,
  bufferMs: number,
  sentCol: "reminder24hSent" | "reminder1hSent" | "reminder10mSent",
  dbCol: "reminder_24h_sent" | "reminder_1h_sent" | "reminder_10m_sent",
  label: string
) {
  const now = new Date();
  const windowStart = new Date(now.getTime() + windowMs - bufferMs);
  const windowEnd = new Date(now.getTime() + windowMs + bufferMs);

  const tasks = await db
    .select()
    .from(tasksTable)
    .where(
      and(
        inArray(tasksTable.status, [...ACTIVE_STATUSES]),
        gte(tasksTable.deadline, windowStart),
        lte(tasksTable.deadline, windowEnd),
        eq(tasksTable[sentCol], false)
      )
    );

  for (const task of tasks) {
    try {
      const deadlineStr = new Date(task.deadline).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });

      const pushTitle = `⏰ Deadline in ${label}`;
      const pushBody = `"${task.title}" is due at ${deadlineStr}`;

      await sendPushToUser(task.assigneeId, pushTitle, pushBody, task.id);

      await db.insert(notificationsTable).values({
        userId: task.assigneeId,
        type: "deadline_approaching",
        message: `Your task "${task.title}" is due in ${label}`,
        taskId: task.id,
      });

      await db
        .update(tasksTable)
        .set({ [sentCol]: true } as any)
        .where(eq(tasksTable.id, task.id));

      logger.info({ taskId: task.id, label }, "Deadline reminder sent");
    } catch (err) {
      logger.error({ err, taskId: task.id }, "Failed to send deadline reminder");
    }
  }
}

export function startDeadlineReminders() {
  const MINUTE = 60 * 1000;
  const BUFFER = 3 * MINUTE;

  async function tick() {
    try {
      await Promise.all([
        checkAndSend(24 * 60 * MINUTE, BUFFER, "reminder24hSent", "reminder_24h_sent", "24 hours"),
        checkAndSend(60 * MINUTE,       BUFFER, "reminder1hSent",  "reminder_1h_sent",  "1 hour"),
        checkAndSend(10 * MINUTE,       BUFFER, "reminder10mSent", "reminder_10m_sent", "10 minutes"),
      ]);
    } catch (err) {
      logger.error({ err }, "Deadline reminder tick failed");
    }
  }

  tick();
  setInterval(tick, MINUTE);
  logger.info("Deadline reminder scheduler started (every 1 min)");
}
