import { Router } from "express";
import { db, messagesTable, tasksTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ListMessagesParams, SendMessageParams, SendMessageBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { serializeUser } from "./auth";

const router = Router();
router.use(requireAuth);

router.get("/tasks/:id/messages", async (req, res): Promise<void> => {
  const params = ListMessagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
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

  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, params.data.id));
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

  const [sender] = await db.select().from(usersTable).where(eq(usersTable.id, message.senderId));

  res.status(201).json({
    id: message.id,
    taskId: message.taskId,
    senderId: message.senderId,
    sender: sender ? serializeUser(sender) : undefined,
    content: message.content,
    attachmentUrl: message.attachmentUrl ?? null,
    attachmentName: message.attachmentName ?? null,
    createdAt: message.createdAt.toISOString(),
  });
});

export default router;
