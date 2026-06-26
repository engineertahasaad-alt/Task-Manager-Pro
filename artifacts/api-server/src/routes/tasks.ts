import { Router } from "express";
import { db, tasksTable, usersTable, attachmentsTable, messagesTable, notificationsTable, groupMembershipsTable, taskAssigneesTable } from "@workspace/db";
import { eq, and, gte, lte, inArray, count, sql } from "drizzle-orm";
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
import { sendPushToUser } from "../lib/pushNotifications";

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

/** Fetch all assignee user records for a task */
async function getTaskAssignees(taskId: number) {
  const rows = await db
    .select({ user: usersTable })
    .from(taskAssigneesTable)
    .innerJoin(usersTable, eq(usersTable.id, taskAssigneesTable.userId))
    .where(eq(taskAssigneesTable.taskId, taskId));
  return rows.map(r => serializeUser(r.user));
}

/** Sync task_assignees: insert new, delete removed. Returns newly added user IDs. */
async function syncTaskAssignees(taskId: number, assigneeIds: number[]): Promise<number[]> {
  const existing = await db
    .select({ userId: taskAssigneesTable.userId })
    .from(taskAssigneesTable)
    .where(eq(taskAssigneesTable.taskId, taskId));

  const existingIds = new Set(existing.map(r => r.userId));
  const newIds = new Set(assigneeIds);

  const toAdd = assigneeIds.filter(id => !existingIds.has(id));
  const toRemove = [...existingIds].filter(id => !newIds.has(id));

  if (toAdd.length > 0) {
    await db.insert(taskAssigneesTable).values(
      toAdd.map(userId => ({ taskId, userId }))
    ).onConflictDoNothing();
  }

  if (toRemove.length > 0) {
    await db.delete(taskAssigneesTable).where(
      and(eq(taskAssigneesTable.taskId, taskId), inArray(taskAssigneesTable.userId, toRemove))
    );
  }

  return toAdd;
}

async function serializeTask(task: typeof tasksTable.$inferSelect, includeRelations = true) {
  let assignee = undefined;
  let creator = undefined;
  let reassignTo = undefined;
  let attachments: unknown[] = [];
  let messageCount = 0;
  let assignees: unknown[] = [];

  if (includeRelations) {
    const [creatorRow] = await db.select().from(usersTable).where(eq(usersTable.id, task.creatorId));
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

    assignees = await getTaskAssignees(task.id);
    // Derive legacy assignee/assigneeId from junction table for backward compat
    if (assignees.length > 0) {
      assignee = assignees[0];
    }
  }

  const firstAssignee = assignees[0] as any;

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    assigneeId: firstAssignee?.id ?? null,
    assignee,
    assignees,
    creatorId: task.creatorId,
    creator,
    deadline: task.deadline.toISOString(),
    status: task.status,
    reassignToId: task.reassignToId ?? null,
    reassignTo: reassignTo ?? null,
    reassignFromId: task.reassignFromId ?? null,
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

/** Load a task that belongs to the requester's active group. Returns null if not found or wrong group. */
async function loadTaskInGroup(taskId: number, groupId: number | null | undefined) {
  if (groupId == null) return null;
  const [task] = await db
    .select()
    .from(tasksTable)
    .where(and(eq(tasksTable.id, taskId), eq(tasksTable.teamId, groupId)));
  return task ?? null;
}

/** Resolve assigneeIds from request body - supports both assigneeIds[] and legacy assigneeId */
function resolveAssigneeIds(body: { assigneeIds?: number[]; assigneeId?: number }): number[] | null {
  if (body.assigneeIds && body.assigneeIds.length > 0) {
    return body.assigneeIds;
  }
  if (body.assigneeId) {
    return [body.assigneeId];
  }
  return null;
}

router.get("/tasks", async (req, res): Promise<void> => {
  const params = ListTasksQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { status, assigneeId, dateFilter, startDate, endDate } = params.data;
  const conditions = [];

  const groupId = req.user!.groupId;
  if (groupId != null) conditions.push(eq(tasksTable.teamId, groupId));

  if (req.user!.role === "member") {
    // Members see tasks they are assigned to (via junction table)
    const memberTaskIds = await db
      .select({ taskId: taskAssigneesTable.taskId })
      .from(taskAssigneesTable)
      .where(eq(taskAssigneesTable.userId, req.user!.id));
    const ids = memberTaskIds.map(r => r.taskId);
    if (ids.length === 0) {
      res.json([]);
      return;
    }
    conditions.push(inArray(tasksTable.id, ids));
  } else if (assigneeId) {
    // Filter by assignee via junction table
    const assigneeTaskIds = await db
      .select({ taskId: taskAssigneesTable.taskId })
      .from(taskAssigneesTable)
      .where(eq(taskAssigneesTable.userId, assigneeId));
    const ids = assigneeTaskIds.map(r => r.taskId);
    if (ids.length === 0) {
      res.json([]);
      return;
    }
    conditions.push(inArray(tasksTable.id, ids));
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

  const { title, description, deadline } = parsed.data;
  const assigneeIds = resolveAssigneeIds(parsed.data as any);
  if (!assigneeIds || assigneeIds.length === 0) {
    res.status(400).json({ error: "At least one assignee is required (assigneeIds or assigneeId)" });
    return;
  }

  const [task] = await db
    .insert(tasksTable)
    .values({
      title,
      description: description ?? "",
      creatorId: req.user!.id,
      teamId: req.user!.groupId,
      deadline: new Date(deadline),
      status: "open",
    })
    .returning();

  // Insert all assignees into junction table
  await db.insert(taskAssigneesTable).values(
    assigneeIds.map(userId => ({ taskId: task.id, userId }))
  ).onConflictDoNothing();

  // Notify all assignees
  for (const aId of assigneeIds) {
    const [assignee] = await db.select().from(usersTable).where(eq(usersTable.id, aId));
    if (assignee) {
      await createNotification(aId, "task_assigned", `You have been assigned a new task: "${title}"`, task.id);
      await sendPushToUser(aId, "New Task Assigned", `You've been assigned: "${title}"`, task.id);
    }
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
  const task = await loadTaskInGroup(params.data.id, req.user!.groupId);
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  // Members may only view tasks they are assigned to (via junction table)
  if (req.user!.role === "member") {
    const [assignment] = await db
      .select()
      .from(taskAssigneesTable)
      .where(and(eq(taskAssigneesTable.taskId, task.id), eq(taskAssigneesTable.userId, req.user!.id)));
    if (!assignment) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
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

  const groupId = req.user!.groupId;
  if (groupId == null) { res.status(403).json({ error: "No active group" }); return; }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.title) updateData.title = parsed.data.title;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.deadline) updateData.deadline = new Date(parsed.data.deadline);

  const newAssigneeIds = resolveAssigneeIds(parsed.data as any);

  const [task] = await db
    .update(tasksTable)
    .set(updateData)
    .where(and(eq(tasksTable.id, params.data.id), eq(tasksTable.teamId, groupId)))
    .returning();

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  // Sync assignees if provided
  if (newAssigneeIds && newAssigneeIds.length > 0) {
    const newlyAdded = await syncTaskAssignees(task.id, newAssigneeIds);
    for (const aId of newlyAdded) {
      await createNotification(aId, "task_assigned", `You have been assigned the task: "${task.title}"`, task.id);
      await sendPushToUser(aId, "Task Assigned", `You've been assigned: "${task.title}"`, task.id);
    }
  }

  res.json(await serializeTask(task));
});

router.patch("/tasks/:id/complete", async (req, res): Promise<void> => {
  const params = CompleteTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const groupId = req.user!.groupId;
  const task = await loadTaskInGroup(params.data.id, groupId);
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  // Members can complete if they are an assignee (via junction table)
  if (req.user!.role === "member") {
    const [assigneeRow] = await db
      .select()
      .from(taskAssigneesTable)
      .where(and(eq(taskAssigneesTable.taskId, task.id), eq(taskAssigneesTable.userId, req.user!.id)));
    if (!assigneeRow) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  const [updated] = await db
    .update(tasksTable)
    .set({ status: "completed" })
    .where(and(eq(tasksTable.id, params.data.id), eq(tasksTable.teamId, groupId!)))
    .returning();

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
      await createNotification(mem.userId, "task_completed", `Task "${task.title}" has been marked as completed`, task.id);
    }
  }

  res.json(await serializeTask(updated));
});

router.patch("/tasks/:id/approve", requireRole("owner", "deputy"), async (req, res): Promise<void> => {
  const params = ApproveTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const groupId = req.user!.groupId;
  const task = await loadTaskInGroup(params.data.id, groupId);
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const [updated] = await db
    .update(tasksTable)
    .set({ status: "approved" })
    .where(and(eq(tasksTable.id, params.data.id), eq(tasksTable.teamId, groupId!)))
    .returning();

  // Notify all assignees
  const assigneeRows = await db
    .select({ userId: taskAssigneesTable.userId })
    .from(taskAssigneesTable)
    .where(eq(taskAssigneesTable.taskId, task.id));
  for (const row of assigneeRows) {
    await createNotification(row.userId, "task_approved", `Your task "${task.title}" has been approved`, task.id);
    await sendPushToUser(row.userId, "Task Approved", `"${task.title}" was approved`, task.id);
  }

  res.json(await serializeTask(updated));
});

router.patch("/tasks/:id/reopen", requireRole("owner", "deputy"), async (req, res): Promise<void> => {
  const params = ReopenTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const groupId = req.user!.groupId;
  const task = await loadTaskInGroup(params.data.id, groupId);
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const [updated] = await db
    .update(tasksTable)
    .set({ status: "reopened" })
    .where(and(eq(tasksTable.id, params.data.id), eq(tasksTable.teamId, groupId!)))
    .returning();

  // Notify all assignees
  const assigneeRows = await db
    .select({ userId: taskAssigneesTable.userId })
    .from(taskAssigneesTable)
    .where(eq(taskAssigneesTable.taskId, task.id));
  for (const row of assigneeRows) {
    await createNotification(row.userId, "task_reopened", `Your task "${task.title}" has been reopened`, task.id);
    await sendPushToUser(row.userId, "Task Reopened", `"${task.title}" was reopened`, task.id);
  }

  res.json(await serializeTask(updated));
});

router.post("/tasks/:id/reassign-request", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid task id" }); return; }

  const requestedAssigneeId = Number(req.body?.requestedAssigneeId);
  if (!requestedAssigneeId || isNaN(requestedAssigneeId)) {
    res.status(400).json({ error: "requestedAssigneeId is required and must be an integer" }); return;
  }

  const groupId = req.user!.groupId;
  const task = await loadTaskInGroup(id, groupId);
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }

  // Check requester is an assignee
  const [requesterAssignment] = await db
    .select()
    .from(taskAssigneesTable)
    .where(and(eq(taskAssigneesTable.taskId, id), eq(taskAssigneesTable.userId, req.user!.id)));

  if (!requesterAssignment && req.user!.role === "member") {
    res.status(403).json({ error: "You are not an assignee of this task" }); return;
  }

  if (task.status !== "open" && task.status !== "reopened") {
    res.status(400).json({ error: "Can only request reassignment for open or reopened tasks" }); return;
  }
  if (task.reassignStatus === "pending") {
    res.status(400).json({ error: "A reassignment request is already pending" }); return;
  }
  if (requestedAssigneeId === req.user!.id) {
    res.status(400).json({ error: "You cannot reassign the task to yourself" }); return;
  }

  // Ensure new assignee is a member of the same group
  if (groupId != null) {
    const [newMem] = await db
      .select()
      .from(groupMembershipsTable)
      .where(and(eq(groupMembershipsTable.userId, requestedAssigneeId), eq(groupMembershipsTable.groupId, groupId), eq(groupMembershipsTable.isActive, true)));
    if (!newMem) { res.status(404).json({ error: "Requested assignee not found in this group" }); return; }
  }

  const [newAssignee] = await db.select().from(usersTable).where(eq(usersTable.id, requestedAssigneeId));
  if (!newAssignee) { res.status(404).json({ error: "Requested assignee not found" }); return; }

  const [updated] = await db
    .update(tasksTable)
    .set({ reassignToId: requestedAssigneeId, reassignFromId: req.user!.id, reassignStatus: "pending" })
    .where(and(eq(tasksTable.id, id), eq(tasksTable.teamId, groupId!)))
    .returning();

  const requesterName = req.user!.fullName || "Someone";

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
      await createNotification(mem.userId, "task_assigned", `${requesterName} requested to reassign task "${task.title}" to ${newAssignee.fullName}`, task.id);
      await sendPushToUser(mem.userId, "Reassignment Request", `${requesterName} wants to reassign "${task.title}" to ${newAssignee.fullName}`, task.id);
    }
  }

  res.json(await serializeTask(updated));
});

router.patch("/tasks/:id/reassign-approve", requireRole("owner", "deputy"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid task id" }); return; }

  const groupId = req.user!.groupId;
  const task = await loadTaskInGroup(id, groupId);
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  if (task.reassignStatus !== "pending" || !task.reassignToId) {
    res.status(400).json({ error: "No pending reassignment request" }); return;
  }

  // The requesting assignee is tracked in reassignFromId
  const requestingAssigneeId = task.reassignFromId;
  const newAssigneeId = task.reassignToId;

  if (!requestingAssigneeId) {
    res.status(400).json({ error: "Cannot determine who requested reassignment" }); return;
  }

  const [updated] = await db
    .update(tasksTable)
    .set({ reassignToId: null, reassignFromId: null, reassignStatus: null })
    .where(and(eq(tasksTable.id, id), eq(tasksTable.teamId, groupId!)))
    .returning();

  // Remove the requesting assignee from junction table, add the new one
  await db.delete(taskAssigneesTable).where(
    and(eq(taskAssigneesTable.taskId, id), eq(taskAssigneesTable.userId, requestingAssigneeId))
  );
  await db.insert(taskAssigneesTable).values({ taskId: id, userId: newAssigneeId }).onConflictDoNothing();

  await createNotification(newAssigneeId, "task_assigned", `You have been assigned the task: "${task.title}"`, task.id);
  await createNotification(requestingAssigneeId, "task_assigned", `Your reassignment request for "${task.title}" was approved`, task.id);
  await sendPushToUser(newAssigneeId, "Task Assigned", `You've been assigned: "${task.title}"`, task.id);
  await sendPushToUser(requestingAssigneeId, "Reassignment Approved", `Your reassignment request for "${task.title}" was approved`, task.id);

  res.json(await serializeTask(updated));
});

router.patch("/tasks/:id/reassign-reject", requireRole("owner", "deputy"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid task id" }); return; }

  const groupId = req.user!.groupId;
  const task = await loadTaskInGroup(id, groupId);
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  if (task.reassignStatus !== "pending") {
    res.status(400).json({ error: "No pending reassignment request" }); return;
  }

  const [updated] = await db
    .update(tasksTable)
    .set({ reassignToId: null, reassignFromId: null, reassignStatus: null })
    .where(and(eq(tasksTable.id, id), eq(tasksTable.teamId, groupId!)))
    .returning();

  // Notify the requester (tracked in reassignFromId)
  if (task.reassignFromId) {
    await createNotification(task.reassignFromId, "task_assigned", `Your reassignment request for "${task.title}" was rejected`, task.id);
    await sendPushToUser(task.reassignFromId, "Reassignment Rejected", `Your request to reassign "${task.title}" was not approved`, task.id);
  }

  res.json(await serializeTask(updated));
});

export { serializeTask };
export default router;
