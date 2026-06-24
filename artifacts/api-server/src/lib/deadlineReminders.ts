import { db, tasksTable, notificationsTable } from "@workspace/db";
import { eq, and, gte, lte, lt, inArray } from "drizzle-orm";
import { sendPushToUser } from "./pushNotifications";
import { logger } from "./logger";

const ACTIVE_STATUSES = ["open", "reopened"] as const;

async function checkAndSend(
  windowMs: number,
  bufferMs: number,
  sentCol: "reminder24hSent" | "reminder1hSent" | "reminder10mSent",
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

      await sendPushToUser(task.assigneeId, `⏰ Deadline in ${label}`, `"${task.title}" is due at ${deadlineStr}`, task.id);
      await db.insert(notificationsTable).values({
        userId: task.assigneeId,
        type: "deadline_approaching",
        message: `Your task "${task.title}" is due in ${label}`,
        taskId: task.id,
      });
      await db.update(tasksTable).set({ [sentCol]: true } as any).where(eq(tasksTable.id, task.id));

      logger.info({ taskId: task.id, label }, "Deadline reminder sent");
    } catch (err) {
      logger.error({ err, taskId: task.id }, "Failed to send deadline reminder");
    }
  }
}

async function checkOverdue() {
  const now = new Date();

  const tasks = await db
    .select()
    .from(tasksTable)
    .where(
      and(
        inArray(tasksTable.status, [...ACTIVE_STATUSES]),
        lt(tasksTable.deadline, now),
        eq(tasksTable.overdueReminderSent, false)
      )
    );

  for (const task of tasks) {
    try {
      const dateStr = new Date(task.deadline).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });

      await sendPushToUser(task.assigneeId, "🚨 Task Overdue", `"${task.title}" was due ${dateStr} and hasn't been completed`, task.id);
      await db.insert(notificationsTable).values({
        userId: task.assigneeId,
        type: "deadline_approaching",
        message: `Your task "${task.title}" is overdue — please complete or request reassignment`,
        taskId: task.id,
      });
      await db.update(tasksTable).set({ overdueReminderSent: true }).where(eq(tasksTable.id, task.id));

      logger.info({ taskId: task.id }, "Overdue reminder sent");
    } catch (err) {
      logger.error({ err, taskId: task.id }, "Failed to send overdue reminder");
    }
  }
}

export function startDeadlineReminders() {
  const MINUTE = 60 * 1000;
  const BUFFER = 3 * MINUTE;

  async function tick() {
    try {
      await Promise.all([
        checkAndSend(24 * 60 * MINUTE, BUFFER, "reminder24hSent", "24 hours"),
        checkAndSend(60 * MINUTE,       BUFFER, "reminder1hSent",  "1 hour"),
        checkAndSend(10 * MINUTE,       BUFFER, "reminder10mSent", "10 minutes"),
        checkOverdue(),
      ]);
    } catch (err) {
      logger.error({ err }, "Deadline reminder tick failed");
    }
  }

  tick();
  setInterval(tick, MINUTE);
  logger.info("Deadline reminder scheduler started (every 1 min)");
}
