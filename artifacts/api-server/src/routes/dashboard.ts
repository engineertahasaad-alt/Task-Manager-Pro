import { Router } from "express";
import { db, tasksTable, usersTable, groupMembershipsTable, taskAssigneesTable } from "@workspace/db";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { GetDashboardSummaryQueryParams, GetWorkloadByEmployeeQueryParams } from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { serializeTask } from "./tasks";

const router = Router();
router.use(requireAuth);

function getDateRange(dateFilter?: string | null, startDate?: string | null, endDate?: string | null) {
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

router.get("/dashboard/summary", requireRole("owner", "deputy"), async (req, res): Promise<void> => {
  const params = GetDashboardSummaryQueryParams.safeParse(req.query);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const { dateFilter, startDate, endDate, assigneeId } = params.data;
  const range = getDateRange(dateFilter, startDate, endDate);
  const now = new Date();
  const groupId = req.user!.groupId;

  const conditions: any[] = [];
  if (groupId != null) conditions.push(eq(tasksTable.teamId, groupId));
  if (range) {
    conditions.push(gte(tasksTable.createdAt, range.start));
    conditions.push(lte(tasksTable.createdAt, range.end));
  }

  let allTasks = await db.select().from(tasksTable).where(conditions.length ? and(...conditions) : undefined);

  // Filter by assignee via junction table if specified
  if (assigneeId) {
    const assigneeTaskIds = await db
      .select({ taskId: taskAssigneesTable.taskId })
      .from(taskAssigneesTable)
      .where(eq(taskAssigneesTable.userId, assigneeId));
    const ids = new Set(assigneeTaskIds.map(r => r.taskId));
    allTasks = allTasks.filter(t => ids.has(t.id));
  }

  const total    = allTasks.length;
  const open     = allTasks.filter(t => t.status === "open" || t.status === "reopened").length;
  const completed = allTasks.filter(t => t.status === "completed" || t.status === "approved").length;
  const approved  = allTasks.filter(t => t.status === "approved").length;
  const overdue   = allTasks.filter(t => t.deadline < now && t.status !== "approved").length;

  res.json({ total, open, completed, approved, overdue });
});

router.get("/dashboard/workload", requireRole("owner", "deputy"), async (req, res): Promise<void> => {
  const params = GetWorkloadByEmployeeQueryParams.safeParse(req.query);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const { dateFilter, startDate, endDate } = params.data;
  const range = getDateRange(dateFilter, startDate, endDate);
  const now = new Date();
  const groupId = req.user!.groupId;

  let memberIds: number[] = [];
  if (groupId != null) {
    const memberships = await db
      .select()
      .from(groupMembershipsTable)
      .where(
        and(
          eq(groupMembershipsTable.groupId, groupId),
          eq(groupMembershipsTable.role, "member"),
          eq(groupMembershipsTable.isActive, true)
        )
      );
    memberIds = memberships.map((m) => m.userId);
  }

  if (memberIds.length === 0) {
    res.json([]);
    return;
  }

  const members = await db
    .select()
    .from(usersTable)
    .where(inArray(usersTable.id, memberIds));

  const workload = await Promise.all(members.map(async (user) => {
    // Get all tasks this member is assigned to (via junction table)
    const assigneeRows = await db
      .select({ taskId: taskAssigneesTable.taskId })
      .from(taskAssigneesTable)
      .where(eq(taskAssigneesTable.userId, user.id));

    if (assigneeRows.length === 0) {
      return { userId: user.id, fullName: user.fullName, total: 0, open: 0, completed: 0, approved: 0, overdue: 0 };
    }

    const taskIds = assigneeRows.map(r => r.taskId);
    const conds: any[] = [inArray(tasksTable.id, taskIds)];
    if (groupId != null) conds.push(eq(tasksTable.teamId, groupId));
    if (range) {
      conds.push(gte(tasksTable.createdAt, range.start));
      conds.push(lte(tasksTable.createdAt, range.end));
    }
    const tasks = await db.select().from(tasksTable).where(and(...conds));
    return {
      userId: user.id,
      fullName: user.fullName,
      total: tasks.length,
      open: tasks.filter(t => t.status === "open" || t.status === "reopened").length,
      completed: tasks.filter(t => t.status === "completed").length,
      approved: tasks.filter(t => t.status === "approved").length,
      overdue: tasks.filter(t => t.deadline < now && t.status !== "approved").length,
    };
  }));

  res.json(workload);
});

router.get("/dashboard/my-tasks", async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const groupId = req.user!.groupId;
  const now = new Date();
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

  // Get all task IDs this user is assigned to via junction table
  const assigneeRows = await db
    .select({ taskId: taskAssigneesTable.taskId })
    .from(taskAssigneesTable)
    .where(eq(taskAssigneesTable.userId, userId));

  if (assigneeRows.length === 0) {
    res.json({ today: [], upcoming: [], overdue: [] });
    return;
  }

  const taskIds = assigneeRows.map(r => r.taskId);
  const conds: any[] = [
    inArray(tasksTable.id, taskIds),
    inArray(tasksTable.status, ["open", "reopened", "completed"]),
  ];
  if (groupId != null) conds.push(eq(tasksTable.teamId, groupId));

  const allTasks = await db.select().from(tasksTable).where(and(...conds)).orderBy(tasksTable.deadline);

  const todayTasks    = allTasks.filter(t => t.deadline <= todayEnd && t.deadline >= now);
  const overdueTasks  = allTasks.filter(t => t.deadline < now && t.status !== "approved");
  const upcomingTasks = allTasks.filter(t => t.deadline > todayEnd);

  const [serializedToday, serializedOverdue, serializedUpcoming] = await Promise.all([
    Promise.all(todayTasks.map(t => serializeTask(t))),
    Promise.all(overdueTasks.map(t => serializeTask(t))),
    Promise.all(upcomingTasks.map(t => serializeTask(t))),
  ]);

  res.json({ today: serializedToday, upcoming: serializedUpcoming, overdue: serializedOverdue });
});

export default router;
