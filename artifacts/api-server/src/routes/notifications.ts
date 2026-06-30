import { Router } from "express";
import { db, notificationsTable, tasksTable, usersTable } from "@workspace/db";
import { eq, and, or, isNull, desc } from "drizzle-orm";
import { MarkNotificationReadParams } from "@workspace/api-zod";
import { requireAuth, JWT_SECRET } from "../middlewares/auth";
import jwt from "jsonwebtoken";
import { addSseConnection, removeSseConnection } from "../lib/sseManager";

const router = Router();

router.get("/notifications", requireAuth, async (req, res): Promise<void> => {
  const groupId = req.user!.groupId;

  // Scope notifications to the active group by joining with tasks.
  // Notifications without a taskId (system-level) are always included.
  const rows = await db
    .select({ n: notificationsTable })
    .from(notificationsTable)
    .leftJoin(tasksTable, eq(notificationsTable.taskId, tasksTable.id))
    .where(
      and(
        eq(notificationsTable.userId, req.user!.id),
        groupId != null
          ? or(isNull(notificationsTable.taskId), eq(tasksTable.teamId, groupId))
          : isNull(notificationsTable.taskId)
      )
    )
    .orderBy(desc(notificationsTable.createdAt));

  res.json(
    rows.map(({ n }) => ({
      id: n.id,
      userId: n.userId,
      type: n.type,
      message: n.message,
      taskId: n.taskId ?? null,
      isRead: n.isRead,
      createdAt: n.createdAt.toISOString(),
    }))
  );
});

router.patch("/notifications/:id/read", requireAuth, async (req, res): Promise<void> => {
  const params = MarkNotificationReadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [notif] = await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(
      and(
        eq(notificationsTable.id, params.data.id),
        eq(notificationsTable.userId, req.user!.id)
      )
    )
    .returning();

  if (!notif) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }

  res.json({
    id: notif.id,
    userId: notif.userId,
    type: notif.type,
    message: notif.message,
    taskId: notif.taskId ?? null,
    isRead: notif.isRead,
    createdAt: notif.createdAt.toISOString(),
  });
});

router.patch("/notifications/read-all", requireAuth, async (req, res): Promise<void> => {
  await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(eq(notificationsTable.userId, req.user!.id));

  res.json({ message: "All notifications marked as read" });
});

router.get("/notifications/preferences", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db
    .select({
      notifyReminder24h: usersTable.notifyReminder24h,
      notifyReminder1h: usersTable.notifyReminder1h,
      notifyReminder10m: usersTable.notifyReminder10m,
      notifyOverdue: usersTable.notifyOverdue,
    })
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.id));

  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  res.json({
    reminder24h: user.notifyReminder24h,
    reminder1h: user.notifyReminder1h,
    reminder10m: user.notifyReminder10m,
    overdue: user.notifyOverdue,
  });
});

router.put("/notifications/preferences", requireAuth, async (req, res): Promise<void> => {
  const { reminder24h, reminder1h, reminder10m, overdue } = req.body;

  if (
    typeof reminder24h !== "boolean" ||
    typeof reminder1h !== "boolean" ||
    typeof reminder10m !== "boolean" ||
    typeof overdue !== "boolean"
  ) {
    res.status(400).json({ error: "All preference fields must be booleans" });
    return;
  }

  await db
    .update(usersTable)
    .set({
      notifyReminder24h: reminder24h,
      notifyReminder1h: reminder1h,
      notifyReminder10m: reminder10m,
      notifyOverdue: overdue,
    })
    .where(eq(usersTable.id, req.user!.id));

  res.json({ reminder24h, reminder1h, reminder10m, overdue });
});

router.get("/notifications/stream", async (req, res): Promise<void> => {
  const token = typeof req.query.token === "string" ? req.query.token : null;
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  let userId: number;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number };
    userId = payload.userId;
  } catch {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  addSseConnection(userId, res);
  res.write(": connected\n\n");

  const heartbeat = setInterval(() => {
    try { res.write(": heartbeat\n\n"); } catch { /* client gone */ }
  }, 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    removeSseConnection(userId, res);
  });
});

export default router;
