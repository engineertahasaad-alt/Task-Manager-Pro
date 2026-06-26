import { Router } from "express";
import { db, tasksTable, usersTable, taskAssigneesTable } from "@workspace/db";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { GetDailyReportQueryParams, GetEmployeeReportQueryParams } from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { serializeTask } from "./tasks";
import { loadOwnedMembership } from "../lib/groupOwnership";

const router = Router();
router.use(requireAuth, requireRole("owner", "deputy"));

router.get("/reports/daily", async (req, res): Promise<void> => {
  const params = GetDailyReportQueryParams.safeParse(req.query);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const dateStr = params.data.date ?? new Date().toISOString().split("T")[0];
  const start = new Date(dateStr); start.setHours(0, 0, 0, 0);
  const end = new Date(dateStr); end.setHours(23, 59, 59, 999);
  const now = new Date();
  const groupId = req.user!.groupId;

  const conds: any[] = [gte(tasksTable.createdAt, start), lte(tasksTable.createdAt, end)];
  if (groupId != null) conds.push(eq(tasksTable.teamId, groupId));

  const tasks = await db.select().from(tasksTable).where(and(...conds)).orderBy(tasksTable.deadline);
  const serialized = await Promise.all(tasks.map(t => serializeTask(t)));

  res.json({
    title: `Daily Report — ${dateStr}`,
    period: dateStr,
    total: tasks.length,
    completed: tasks.filter(t => t.status === "completed").length,
    approved: tasks.filter(t => t.status === "approved").length,
    overdue: tasks.filter(t => t.deadline < now && t.status !== "approved").length,
    tasks: serialized,
    employeeName: null,
  });
});

router.get("/reports/employee", async (req, res): Promise<void> => {
  const params = GetEmployeeReportQueryParams.safeParse(req.query);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const { employeeId, startDate, endDate } = params.data;
  const now = new Date();
  const groupId = req.user!.groupId;

  let taskIds: number[] | null = null;

  // Filter by employee via junction table so all assignees (not just primary) are included
  if (employeeId) {
    // Assert the target employee belongs to the requester's group (throws 403 if cross-group)
    const membership = await loadOwnedMembership(employeeId, groupId);
    if (!membership) {
      res.status(404).json({ error: "Employee not found" });
      return;
    }

    const assigneeRows = await db
      .select({ taskId: taskAssigneesTable.taskId })
      .from(taskAssigneesTable)
      .where(eq(taskAssigneesTable.userId, employeeId));
    taskIds = assigneeRows.map(r => r.taskId);
    // If employee has no tasks, return empty result immediately
    if (taskIds.length === 0) {
      let employeeName: string | null = null;
      const [emp] = await db.select().from(usersTable).where(eq(usersTable.id, employeeId));
      employeeName = emp?.fullName ?? null;
      res.json({
        title: `Employee Report${employeeName ? ` — ${employeeName}` : ""}`,
        period: startDate && endDate ? `${startDate} to ${endDate}` : "All time",
        total: 0, completed: 0, approved: 0, overdue: 0,
        tasks: [],
        employeeName,
      });
      return;
    }
  }

  const conditions: any[] = [];
  if (groupId != null) conditions.push(eq(tasksTable.teamId, groupId));
  if (taskIds !== null) conditions.push(inArray(tasksTable.id, taskIds));
  if (startDate) conditions.push(gte(tasksTable.createdAt, new Date(startDate)));
  if (endDate) {
    const end = new Date(endDate); end.setHours(23, 59, 59, 999);
    conditions.push(lte(tasksTable.createdAt, end));
  }

  const tasks = await db.select().from(tasksTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(tasksTable.deadline);
  const serialized = await Promise.all(tasks.map(t => serializeTask(t)));

  let employeeName: string | null = null;
  if (employeeId) {
    const [emp] = await db.select().from(usersTable).where(eq(usersTable.id, employeeId));
    employeeName = emp?.fullName ?? null;
  }

  res.json({
    title: `Employee Report${employeeName ? ` — ${employeeName}` : ""}`,
    period: startDate && endDate ? `${startDate} to ${endDate}` : "All time",
    total: tasks.length,
    completed: tasks.filter(t => t.status === "completed").length,
    approved: tasks.filter(t => t.status === "approved").length,
    overdue: tasks.filter(t => t.deadline < now && t.status !== "approved").length,
    tasks: serialized,
    employeeName,
  });
});

export default router;
