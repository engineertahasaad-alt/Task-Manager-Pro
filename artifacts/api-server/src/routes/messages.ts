import { Router } from "express";
import { db, messagesTable, tasksTable, usersTable, notificationsTable, groupMembershipsTable, taskAssigneesTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { ListMessagesParams, SendMessageParams, SendMessageBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { serializeUser } from "./auth";

const router = Router();
router.use(requireAuth);

/** Load a task scoped to the requester's active group. */
async function loadTaskInGroup(taskId: number, groupId: number | null | undefined) {
  if (groupId == null) return null;
  const [task] = await db
    .select()
    .from(tasksTable)
    .where(and(eq(tasksTable.id, taskId), eq(tasksTable.teamId, groupId)));
  return task ?? null;
}

router.get("/tasks/:id/messages", async (req, res): Promise<void> => {
  const params = ListMessagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const task = await loadTaskInGroup(params.data.id, req.user!.groupId);
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const messages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.taskId, params.data.id))
    .orderBy(messagesTable.createdAt);

  const serialized = await Promise.all(
    messages.map(async (m) => {
      const [sender] = await db.select().from(usersTable).where(eq(usersTable.id, m.senderId));
      return {
        id: m.id,
        taskId: m.taskId,
        senderId: m.senderId,
        sender: sender ? serializeUser(sender) : undefined,
        content: m.content,
        attachmentUrl: m.attachmentUrl ?? null,
        attachmentName: m.attachmentName ?? null,
        createdAt: m.createdAt.toISOString(),
      };
    })
  );

  res.json(serialized);
});

router.post("/tasks/:id/messages", async (req, res): Promise<void> => {
  const params = SendMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const groupId = req.user!.groupId;
  const task = await loadTaskInGroup(params.data.id, groupId);
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const [message] = await db
    .insert(messagesTable)
    .values({
      taskId: params.data.id,
      senderId: req.user!.id,
      content: parsed.data.content,
      attachmentUrl: parsed.data.attachmentUrl ?? null,
      attachmentName: parsed.data.attachmentName ?? null,
    })
    .returning();

  const sender = req.user!;
  const senderRole = sender.role;
  const isManager = senderRole === "owner" || senderRole === "deputy";

  if (isManager) {
    // Notify all assignees (except the sender if they happen to be one)
    const assigneeRows = await db
      .select({ userId: taskAssigneesTable.userId })
      .from(taskAssigneesTable)
      .where(eq(taskAssigneesTable.taskId, task.id));
    for (const row of assigneeRows) {
      if (row.userId !== sender.id) {
        await db.insert(notificationsTable).values({
          userId: row.userId,
          type: "task_assigned",
          message: `${sender.fullName} sent you a message on task: "${task.title}"`,
          taskId: task.id,
        });
      }
    }
  } else {
    // Notify all managers in this group (not the sender)
    if (groupId != null) {
      const managerMemberships = await db
        .select()
        .from(groupMembershipsTable)
        .where(
          and(
            eq(groupMembershipsTable.groupId, groupId),
            inArray(groupMembershipsTable.role, ["owner", "deputy"]),
            eq(groupMembershipsTable.isActive, true)
          )
        );
      for (const mem of managerMemberships) {
        if (mem.userId !== sender.id) {
          await db.insert(notificationsTable).values({
            userId: mem.userId,
            type: "task_assigned",
            message: `${sender.fullName} replied on task: "${task.title}"`,
            taskId: task.id,
          });
        }
      }
    }
  }

  res.status(201).json({
    id: message.id,
    taskId: message.taskId,
    senderId: message.senderId,
    sender: serializeUser(sender as any),
    content: message.content,
    attachmentUrl: message.attachmentUrl ?? null,
    attachmentName: message.attachmentName ?? null,
    createdAt: message.createdAt.toISOString(),
  });
});

export default router;
