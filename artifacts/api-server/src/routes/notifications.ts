import { Router } from "express";
import { db, notificationsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { MarkNotificationReadParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router = Router();
router.use(requireAuth);

router.get("/notifications", async (req, res): Promise<void> => {
  const notifications = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, req.user!.id))
    .orderBy(notificationsTable.createdAt);

  res.json(
    notifications.map((n) => ({
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

export default router;
