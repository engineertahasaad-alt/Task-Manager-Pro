import { Router } from "express";
import { db, notificationsTable, tasksTable, usersTable } from "@workspace/db";
import { eq, and, or, isNull } from "drizzle-orm";
import { MarkNotificationReadParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router = Router();
router.use(requireAuth);

router.get("/notifications", async (req, res): Promise<void> => {
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
    .orderBy(notificationsTable.createdAt);

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

router.patch("/notifications/:id/read", async (req, res): Promise<void> => {
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

router.patch("/notifications/read-all", async (req, res): Promise<void> => {
  await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(eq(notificationsTable.userId, req.user!.id));

  res.json({ message: "All notifications marked as read" });
});

router.get("/notifications/preferences", async (req, res): Promise<void> => {
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

router.put("/notifications/preferences", async (req, res): Promise<void> => {
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

export default router;
