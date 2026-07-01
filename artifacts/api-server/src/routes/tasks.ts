import { Router } from "express";
import { db, tasksTable, usersTable, attachmentsTable, messagesTable, notificationsTable, groupMembershipsTable, taskAssigneesTable, taskDelegationsTable } from "@workspace/db";
import { eq, and, gte, lte, inArray, count, sql } from "drizzle-orm";
import { logAudit } from "../lib/audit";
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
import { loadOwnedTask } from "../lib/groupOwnership";
import { pushNotificationToUser } from "../lib/sseManager";

const router = Router();

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

async function getDelegatedTaskSummaries(parentTaskId: number) {
  const delegationRows = await db
    .select()
    .from(taskDelegationsTable)
    .where(eq(taskDelegationsTable.originalTaskId, parentTaskId));

  if (delegationRows.length === 0) return [];

  const delegatedTaskIds = delegationRows.map(r => r.delegatedTaskId);
  const delegatedTasks = await db
    .select()
    .from(tasksTable)
    .where(inArray(tasksTable.id, delegatedTaskIds));

  const summaries = await Promise.all(delegatedTasks.map(async (dt) => {
    const assignees = await getTaskAssignees(dt.id);
    const delegation = delegationRows.find(r => r.delegatedTaskId === dt.id);
    return {
      id: dt.id,
      title: dt.title,
      status: dt.status,
      assignees,
      targetGroupId: delegation?.targetGroupId ?? null,
      createdAt: dt.createdAt.toISOString(),
    };
  }));

  return summaries;
}

async function serializeTask(task: typeof tasksTable.$inferSelect, includeRelations = true, includeDelegated = false) {
  let assignee = undefined;
  let creator = undefined;
  let reassignTo = undefined;
  let attachments: unknown[] = [];
  let messageCount = 0;
  let assignees: unknown[] = [];
  let delegatedTasks: unknown[] = [];

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
    if (assignees.length > 0) {
      assignee = assignees[0];
    }

    if (includeDelegated) {
      delegatedTasks = await getDelegatedTaskSummaries(task.id);
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
    parentTaskId: task.parentTaskId ?? null,
    delegatedTasks,
    reassignToId: task.reassignToId ?? null,
    reassignTo: reassignTo ?? null,
    reassignFromId: task.reassignFromId ?? null,
    reassignStatus: task.reassignStatus ?? null,
    attachments,
    messageCount,
    createdAt: task.createdAt.toISOString(),
    priority: (task as any).priority ?? "medium",
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
  pushNotificationToUser(userId);
}

/** Load a task that belongs to the requester's active group. Returns null if not found or wrong group. */
const loadTaskInGroup = loadOwnedTask;

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

router.get("/tasks", requireAuth, async (req, res): Promise<void> => {
  const params = ListTasksQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { status, assigneeId, dateFilter, startDate, endDate } = params.data;
  const delegatedFilter = req.query.delegated === "true";

  // Delegated filter: return tasks the user has delegated, constrained to groups where they
  // currently hold active manager membership (prevents stale visibility after membership changes)
  if (delegatedFilter && (req.user!.role === "owner" || req.user!.role === "deputy")) {
    // Find all groups where the requester is currently an active manager
    const activeManagerMemberships = await db
      .select({ groupId: groupMembershipsTable.groupId })
      .from(groupMembershipsTable)
      .where(
        and(
          eq(groupMembershipsTable.userId, req.user!.id),
          inArray(groupMembershipsTable.role, ["owner", "deputy"]),
          eq(groupMembershipsTable.isActive, true)
        )
      );
    const activeGroupIds = activeManagerMemberships.map(m => m.groupId);
    if (activeGroupIds.length === 0) { res.json([]); return; }

    const delegations = await db
      .select({ originalTaskId: taskDelegationsTable.originalTaskId })
      .from(taskDelegationsTable)
      .where(eq(taskDelegationsTable.delegatedByUserId, req.user!.id));

    if (delegations.length === 0) {
      res.json([]);
      return;
    }

    const originalIds = [...new Set(delegations.map(d => d.originalTaskId))];
    // Only return tasks that belong to groups where requester currently has active membership
    const tasks = await db
      .select()
      .from(tasksTable)
      .where(
        and(
          inArray(tasksTable.id, originalIds),
          inArray(tasksTable.teamId, activeGroupIds)
        )
      )
      .orderBy(tasksTable.deadline);

    const serialized = await Promise.all(tasks.map(t => serializeTask(t, true, true)));
    res.json(serialized);
    return;
  }

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

router.post("/tasks", requireAuth, requireRole("owner", "deputy"), async (req, res): Promise<void> => {
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

  const rawPriority = (req.body as any).priority;
  const priority = ["low", "medium", "high", "critical"].includes(rawPriority) ? rawPriority : "medium";

  const [task] = await db
    .insert(tasksTable)
    .values({
      title,
      description: description ?? "",
      creatorId: req.user!.id,
      teamId: req.user!.groupId,
      deadline: new Date(deadline),
      status: "open",
      priority,
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

  await logAudit("task_created", req.user!.id, req.user!.groupId, "task", task.id, { title, assigneeIds });
  for (const aId of assigneeIds) {
    await logAudit("task_assigned", req.user!.id, req.user!.groupId, "task", task.id, { assigneeId: aId });
  }

  const serialized = await serializeTask(task);
  res.status(201).json(serialized);
});

router.get("/tasks/:id", requireAuth, async (req, res): Promise<void> => {
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
  res.json(await serializeTask(task, true, true));
});

router.post("/tasks/:id/delegate", requireAuth, requireRole("owner", "deputy"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid task id" }); return; }

  const { targetGroupId, assigneeIds } = req.body ?? {};
  if (!targetGroupId || typeof targetGroupId !== "number") {
    res.status(400).json({ error: "targetGroupId is required and must be an integer" }); return;
  }
  if (!Array.isArray(assigneeIds) || assigneeIds.length === 0) {
    res.status(400).json({ error: "assigneeIds must be a non-empty array" }); return;
  }

  const sourceGroupId = req.user!.groupId;
  if (sourceGroupId == null) { res.status(403).json({ error: "No active group" }); return; }

  // Enforce cross-group delegation: target group must differ from source group
  if (targetGroupId === sourceGroupId) {
    res.status(400).json({ error: "Cannot delegate to the same group; choose a different target group" }); return;
  }

  // Verify the task exists in the source group
  const task = await loadTaskInGroup(id, sourceGroupId);
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }

  // Prevent delegating a task that already is a child
  if (task.parentTaskId != null) {
    res.status(400).json({ error: "Cannot delegate a task that is already a delegated child task" }); return;
  }

  // Verify requesting user is a manager (owner/deputy) in the target group
  const [targetMembership] = await db
    .select()
    .from(groupMembershipsTable)
    .where(
      and(
        eq(groupMembershipsTable.userId, req.user!.id),
        eq(groupMembershipsTable.groupId, targetGroupId),
        inArray(groupMembershipsTable.role, ["owner", "deputy"]),
        eq(groupMembershipsTable.isActive, true)
      )
    );
  if (!targetMembership) {
    res.status(403).json({ error: "You must be a manager (owner or deputy) in the target group to delegate" }); return;
  }

  // Verify all assignees are active members of the target group
  for (const aId of assigneeIds) {
    if (typeof aId !== "number") { res.status(400).json({ error: "All assigneeIds must be integers" }); return; }
    const [mem] = await db
      .select()
      .from(groupMembershipsTable)
      .where(and(eq(groupMembershipsTable.userId, aId), eq(groupMembershipsTable.groupId, targetGroupId), eq(groupMembershipsTable.isActive, true)));
    if (!mem) {
      res.status(400).json({ error: `User ${aId} is not an active member of the target group` }); return;
    }
  }

  // Create the child task in the target group.
  // Preserve original creator and original creation timestamp so child task context is clear.
  const [childTask] = await db
    .insert(tasksTable)
    .values({
      title: task.title,
      description: task.description,
      creatorId: task.creatorId,
      teamId: targetGroupId,
      deadline: task.deadline,
      status: "open",
      parentTaskId: task.id,
      createdAt: task.createdAt,
    })
    .returning();

  // Assign members to the child task
  await db.insert(taskAssigneesTable).values(
    (assigneeIds as number[]).map(userId => ({ taskId: childTask.id, userId }))
  ).onConflictDoNothing();

  // Record the delegation event
  await db.insert(taskDelegationsTable).values({
    originalTaskId: task.id,
    delegatedTaskId: childTask.id,
    delegatedByUserId: req.user!.id,
    sourceGroupId,
    targetGroupId,
  });

  // Notify all assignees of the child task
  for (const aId of assigneeIds as number[]) {
    await createNotification(
      aId,
      "task_assigned",
      `You have been assigned a delegated task: "${task.title}"`,
      childTask.id
    );
    await sendPushToUser(aId, "New Delegated Task", `You've been assigned: "${task.title}"`, childTask.id);
  }

  await logAudit("task_delegated", req.user!.id, sourceGroupId, "task", task.id, {
    title: task.title,
    targetGroupId,
    childTaskId: childTask.id,
    assigneeIds,
  });

  res.status(201).json(await serializeTask(childTask, true, false));
});

router.patch("/tasks/:id", requireAuth, requireRole("owner", "deputy"), async (req, res): Promise<void> => {
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
  const rawPatchPriority = (req.body as any).priority;
  if (["low", "medium", "high", "critical"].includes(rawPatchPriority)) updateData.priority = rawPatchPriority;

  const newAssigneeIds = resolveAssigneeIds(parsed.data as any);

  // Verify task exists (404) and belongs to requester's group (403 via assertGroupOwnership)
  const existingTask = await loadTaskInGroup(params.data.id, groupId);
  if (!existingTask) {
    res.status(404).json({ error: "Task not found" });
    return;
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

  // Sync assignees if provided
  if (newAssigneeIds && newAssigneeIds.length > 0) {
    const newlyAdded = await syncTaskAssignees(task.id, newAssigneeIds);
    for (const aId of newlyAdded) {
      await createNotification(aId, "task_assigned", `You have been assigned the task: "${task.title}"`, task.id);
      await sendPushToUser(aId, "Task Assigned", `You've been assigned: "${task.title}"`, task.id);
      await logAudit("task_assigned", req.user!.id, groupId, "task", task.id, { assigneeId: aId });
    }
  }

  res.json(await serializeTask(task));
});

router.patch("/tasks/:id/complete", requireAuth, async (req, res): Promise<void> => {
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

  await logAudit("task_completed", req.user!.id, groupId, "task", task.id, { title: task.title });

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

router.patch("/tasks/:id/approve", requireAuth, requireRole("owner", "deputy"), async (req, res): Promise<void> => {
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

  await logAudit("task_approved", req.user!.id, groupId, "task", task.id, { title: task.title });

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

router.patch("/tasks/:id/reopen", requireAuth, requireRole("owner", "deputy"), async (req, res): Promise<void> => {
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

  await logAudit("task_reopened", req.user!.id, groupId, "task", task.id, { title: task.title });

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

router.post("/tasks/:id/reassign-request", requireAuth, async (req, res): Promise<void> => {
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

  await logAudit("task_reassign_requested", req.user!.id, groupId, "task", task.id, {
    title: task.title,
    requestedAssigneeId,
    requestedAssigneeName: newAssignee.fullName,
  });

  res.json(await serializeTask(updated));
});

router.patch("/tasks/:id/reassign-approve", requireAuth, requireRole("owner", "deputy"), async (req, res): Promise<void> => {
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

  await logAudit("task_assigned", req.user!.id, groupId, "task", task.id, {
    title: task.title,
    newAssigneeId,
    fromAssigneeId: requestingAssigneeId,
    reason: "reassignment_approved",
  });

  res.json(await serializeTask(updated));
});

router.patch("/tasks/:id/reassign-reject", requireAuth, requireRole("owner", "deputy"), async (req, res): Promise<void> => {
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

  await logAudit("task_reassign_rejected", req.user!.id, groupId, "task", task.id, {
    title: task.title,
    requesterId: task.reassignFromId,
    requestedAssigneeId: task.reassignToId,
  });

  // Notify the requester (tracked in reassignFromId)
  if (task.reassignFromId) {
    await createNotification(task.reassignFromId, "task_assigned", `Your reassignment request for "${task.title}" was rejected`, task.id);
    await sendPushToUser(task.reassignFromId, "Reassignment Rejected", `Your request to reassign "${task.title}" was not approved`, task.id);
  }

  res.json(await serializeTask(updated));
});

export { serializeTask };
export default router;
