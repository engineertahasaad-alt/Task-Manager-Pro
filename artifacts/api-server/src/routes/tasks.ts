import { Router } from "express";
import { db, tasksTable, usersTable, attachmentsTable, messagesTable, notificationsTable } from "@workspace/db";
import { eq, and, gte, lte, lt, inArray, sql, count } from "drizzle-orm";
import {
  ListTasksQueryParams,
  CreateTaskBody,
  GetTaskParams,
  UpdateTaskParams,
  UpdateTaskBody,
  CompleteTaskParams,
  ApproveTaskParams,
  ReopenTaskParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { serializeUser } from "./auth";
import path from "path";

const router = Router();
router.use(requireAuth);

function getDateRange(dateFilter?: string, startDate?: string, endDate?: string) {
  const now = new Date();
  if (dateFilter === "today") {
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const end = new Date(now); end.setHours(23, 59, 59, 999);
    return { start, end };
  } else if (dateFilter === "this_week") {
    const day = now.getDay();
    const start = new Date(now); start.setDate(now.getDate() - day); start.setHours(0, 0, 0, 0);
    const end = new Date(now); end.setDate(now.getDate() + (6 - day)); end.setHours(23, 59, 59, 999);
    return { start, end };
  } else if (dateFilter === "this_month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
  } else if (dateFilter === "custom" && startDate && endDate) {
    return { start: new Date(startDate), end: new Date(endDate) };
  }
  return null;
}

async function serializeTask(task: typeof tasksTable.$inferSelect, includeRelations = true) {
  let assignee = undefined;
  let creator = undefined;
  let reassignTo = undefined;
  let attachments: unknown[] = [];
  let messageCount = 0;

  if (includeRelations) {
    const [assigneeRow] = await db.select().from(usersTable).where(eq(usersTable.id, task.assigneeId));
    const [creatorRow] = await db.select().from(usersTable).where(eq(usersTable.id, task.creatorId));
    assignee = assigneeRow ? serializeUser(assigneeRow) : undefined;
    creator = creatorRow ? serializeUser(creatorRow) : undefined;

    if (task.reassignToId) {
      const [reassignRow] = await db.select().from(usersTable).where(eq(usersTable.id, task.reassignToId));
      reassignTo = reassignRow ? serializeUser(reassignRow) : undefined;
    }

    const attRows = await db.select().from(attachmentsTable).where(eq(attachmentsTable.taskId, task.id));
    attachments = attRows.map((a) => ({
      id: a.id,
      taskId: a.taskId,
      filename: a.filename,
      originalName: a.originalName,
      mimeType: a.mimeType,
      size: a.size,
      url: `/api/uploads/${a.filename}`,
      createdAt: a.createdAt.toISOString(),
    }));

    const [msgCount] = await db
      .select({ count: count() })
      .from(messagesTable)
      .where(eq(messagesTable.taskId, task.id));
    messageCount = msgCount?.count ?? 0;
  }

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    assigneeId: task.assigneeId,
    assignee,
    creatorId: task.creatorId,
    creator,
    deadline: task.deadline.toISOString(),
    status: task.status,
    reassignToId: task.reassignToId ?? null,
    reassignTo: reassignTo ?? null,
    reassignStatus: task.reassignStatus ?? null,
    attachments,
    messageCount,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

async function createNotification(
  userId: number,
  type: "task_assigned" | "deadline_approaching" | "task_completed" | "task_approved" | "task_reopened",
  message: string,
  taskId: number
) {
  await db.insert(notificationsTable).values({ userId, type, message, taskId });
}

router.get("/tasks", async (req, res): Promise<void> => {
  const params = ListTasksQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { status, assigneeId, dateFilter, startDate, endDate } = params.data;
  const conditions = [];

  // Scope to team
  const teamId = req.user!.teamId;
  if (teamId != null) conditions.push(eq(tasksTable.teamId, teamId));

  // Members only see their own tasks
  if (req.user!.role === "member") {
    conditions.push(eq(tasksTable.assigneeId, req.user!.id));
  } else if (assigneeId) {
    conditions.push(eq(tasksTable.assigneeId, assigneeId));
  }

  if (status) {
    conditions.push(eq(tasksTable.status, status));
  }

  const range = getDateRange(dateFilter ?? undefined, startDate ?? undefined, endDate ?? undefined);
  if (range) {
    conditions.push(gte(tasksTable.createdAt, range.start));
    conditions.push(lte(tasksTable.createdAt, range.end));
  }

  const tasks = await db
    .select()
    .from(tasksTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(tasksTable.deadline);

  const serialized = await Promise.all(tasks.map((t) => serializeTask(t)));
  res.json(serialized);
});

router.post("/tasks", requireRole("owner", "deputy"), async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { title, description, assigneeId, deadline } = parsed.data;
  const [task] = await db
    .insert(tasksTable)
    .values({
      title,
      description: description ?? "",
      assigneeId,
      creatorId: req.user!.id,
      teamId: req.user!.teamId,
      deadline: new Date(deadline),
      status: "open",
    })
    .returning();

  // Notify assignee
  const [assignee] = await db.select().from(usersTable).where(eq(usersTable.id, assigneeId));
  if (assignee) {
    await createNotification(assigneeId, "task_assigned", `You have been assigned a new task: "${title}"`, task.id);
  }

  const serialized = await serializeTask(task);
  res.status(201).json(serialized);
});

router.get("/tasks/:id", async (req, res): Promise<void> => {
  const params = GetTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, params.data.id));
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.json(await serializeTask(task));
});

router.patch("/tasks/:id", requireRole("owner", "deputy"), async (req, res): Promise<void> => {
  const params = UpdateTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.deadline) {
    updateData.deadline = new Date(parsed.data.deadline);
  }

  const [task] = await db
    .update(tasksTable)
    .set(updateData)
    .where(eq(tasksTable.id, params.data.id))
    .returning();

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.json(await serializeTask(task));
});

router.patch("/tasks/:id/complete", async (req, res): Promise<void> => {
  const params = CompleteTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, params.data.id));
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  if (req.user!.role === "member" && task.assigneeId !== req.user!.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [updated] = await db
    .update(tasksTable)
    .set({ status: "completed" })
    .where(eq(tasksTable.id, params.data.id))
    .returning();

  // Notify managers
  const managers = await db
    .select()
    .from(usersTable)
    .where(inArray(usersTable.role, ["owner", "deputy"]));
  for (const mgr of managers) {
    await createNotification(mgr.id, "task_completed", `Task "${task.title}" has been marked as completed`, task.id);
  }

  res.json(await serializeTask(updated));
});

router.patch("/tasks/:id/approve", requireRole("owner", "deputy"), async (req, res): Promise<void> => {
  const params = ApproveTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, params.data.id));
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const [updated] = await db
    .update(tasksTable)
    .set({ status: "approved" })
    .where(eq(tasksTable.id, params.data.id))
    .returning();

  await createNotification(task.assigneeId, "task_approved", `Your task "${task.title}" has been approved`, task.id);

  res.json(await serializeTask(updated));
});

router.patch("/tasks/:id/reopen", requireRole("owner", "deputy"), async (req, res): Promise<void> => {
  const params = ReopenTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, params.data.id));
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const [updated] = await db
    .update(tasksTable)
    .set({ status: "reopened" })
    .where(eq(tasksTable.id, params.data.id))
    .returning();

  await createNotification(task.assigneeId, "task_reopened", `Your task "${task.title}" has been reopened`, task.id);

  res.json(await serializeTask(updated));
});

router.post("/tasks/:id/reassign-request", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid task id" }); return; }

  const requestedAssigneeId = Number(req.body?.requestedAssigneeId);
  if (!requestedAssigneeId || isNaN(requestedAssigneeId)) {
    res.status(400).json({ error: "requestedAssigneeId is required and must be an integer" }); return;
  }

  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }

  if (task.status !== "open" && task.status !== "reopened") {
    res.status(400).json({ error: "Can only request reassignment for open or reopened tasks" }); return;
  }
  if (task.reassignStatus === "pending") {
    res.status(400).json({ error: "A reassignment request is already pending" }); return;
  }
  if (requestedAssigneeId === task.assigneeId) {
    res.status(400).json({ error: "New assignee must be different from current assignee" }); return;
  }

  const [newAssignee] = await db.select().from(usersTable).where(eq(usersTable.id, requestedAssigneeId));
  if (!newAssignee) { res.status(404).json({ error: "Requested assignee not found" }); return; }

  const [updated] = await db
    .update(tasksTable)
    .set({ reassignToId: requestedAssigneeId, reassignStatus: "pending" })
    .where(eq(tasksTable.id, id))
    .returning();

  const managers = await db.select().from(usersTable).where(inArray(usersTable.role, ["owner", "deputy"]));
  const requesterName = req.user!.fullName || "Someone";
  for (const mgr of managers) {
    await createNotification(mgr.id, "task_assigned", `${requesterName} requested to reassign task "${task.title}" to ${newAssignee.fullName}`, task.id);
  }

  res.json(await serializeTask(updated));
});

router.patch("/tasks/:id/reassign-approve", requireRole("owner", "deputy"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid task id" }); return; }

  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  if (task.reassignStatus !== "pending" || !task.reassignToId) {
    res.status(400).json({ error: "No pending reassignment request" }); return;
  }

  const prevAssigneeId = task.assigneeId;
  const [updated] = await db
    .update(tasksTable)
    .set({ assigneeId: task.reassignToId, reassignToId: null, reassignStatus: null })
    .where(eq(tasksTable.id, id))
    .returning();

  await createNotification(task.reassignToId, "task_assigned", `You have been assigned the task: "${task.title}"`, task.id);
  await createNotification(prevAssigneeId, "task_assigned", `Your reassignment request for "${task.title}" was approved`, task.id);

  res.json(await serializeTask(updated));
});

router.patch("/tasks/:id/reassign-reject", requireRole("owner", "deputy"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid task id" }); return; }

  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  if (task.reassignStatus !== "pending") {
    res.status(400).json({ error: "No pending reassignment request" }); return;
  }

  const [updated] = await db
    .update(tasksTable)
    .set({ reassignToId: null, reassignStatus: null })
    .where(eq(tasksTable.id, id))
    .returning();

  await createNotification(task.assigneeId, "task_assigned", `Your reassignment request for "${task.title}" was rejected`, task.id);

  res.json(await serializeTask(updated));
});

export { serializeTask };
export default router;
