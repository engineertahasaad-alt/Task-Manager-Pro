import { Router } from "express";
import { db, tasksTable, usersTable } from "@workspace/db";
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
  const teamId = req.user!.teamId;

  const conditions: any[] = [];
  if (teamId != null) conditions.push(eq(tasksTable.teamId, teamId));
  if (assigneeId) conditions.push(eq(tasksTable.assigneeId, assigneeId));
  if (range) {
    conditions.push(gte(tasksTable.createdAt, range.start));
    conditions.push(lte(tasksTable.createdAt, range.end));
  }

  const allTasks = await db.select().from(tasksTable).where(conditions.length ? and(...conditions) : undefined);

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
  const teamId = req.user!.teamId;

  const memberConditions: any[] = [eq(usersTable.role, "member")];
  if (teamId != null) memberConditions.push(eq(usersTable.teamId, teamId));

  const members = await db.select().from(usersTable).where(and(...memberConditions));

  const workload = await Promise.all(members.map(async (user) => {
    const conds: any[] = [eq(tasksTable.assigneeId, user.id)];
    if (teamId != null) conds.push(eq(tasksTable.teamId, teamId));
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
  const teamId = req.user!.teamId;
  const now = new Date();
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

  const conds: any[] = [
    eq(tasksTable.assigneeId, userId),
    inArray(tasksTable.status, ["open", "reopened", "completed"]),
  ];
  if (teamId != null) conds.push(eq(tasksTable.teamId, teamId));

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
