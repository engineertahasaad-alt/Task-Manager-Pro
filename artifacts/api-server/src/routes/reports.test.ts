import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const GROUP_A = 1;
const GROUP_B = 2;
const OWNER_ID = 10;

vi.mock("../middlewares/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: OWNER_ID, role: "owner", groupId: GROUP_A, teamId: GROUP_A, fullName: "Owner" };
    next();
  },
  requireRole: (..._roles: string[]) => (_req: any, _res: any, next: any) => next(),
  signToken: vi.fn(),
  JWT_SECRET: "test-secret",
}));

vi.mock("../routes/tasks", async () => {
  const { Router } = await import("express");
  const router = Router();
  return {
    serializeTask: vi.fn(async (task: any) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      deadline: task.deadline?.toISOString?.() ?? task.deadline,
      teamId: task.teamId,
    })),
    default: router,
  };
});

vi.mock("@workspace/db", () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
    orderBy: vi.fn().mockResolvedValue([]),
    innerJoin: vi.fn().mockReturnThis(),
  };
  return {
    db: mockDb,
    tasksTable: {}, usersTable: {}, groupMembershipsTable: {},
    taskAssigneesTable: {}, attachmentsTable: {}, messagesTable: {},
    notificationsTable: {}, taskDelegationsTable: {}, teamsTable: {},
  };
});

vi.mock("../lib/groupOwnership", () => ({
  loadOwnedTask: vi.fn(),
  loadOwnedMembership: vi.fn(),
  assertGroupOwnership: vi.fn(),
  GroupOwnershipError: class GroupOwnershipError extends Error {
    statusCode = 403;
    constructor() { super("Cross-group access denied"); }
  },
}));

function crossGroupError() {
  const err = new Error("Cross-group access denied") as any;
  err.statusCode = 403;
  return err;
}

vi.mock("../lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("pino", () => ({ default: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) }) }));
vi.mock("pino-http", () => ({ default: () => (_req: any, _res: any, next: any) => next() }));

import app from "../app";
import { db } from "@workspace/db";
import { loadOwnedMembership } from "../lib/groupOwnership";

const makeTask = (id: number, teamId: number) => ({
  id, teamId, status: "open" as const, title: `Task ${id}`,
  deadline: new Date("2026-12-31"), createdAt: new Date(), updatedAt: new Date(),
  description: "", creatorId: OWNER_ID, parentTaskId: null,
  reassignToId: null, reassignFromId: null, reassignStatus: null,
});

describe("Reports routes — cross-group isolation", () => {
  const groupATask = makeTask(1, GROUP_A);

  function setupDbWithTasks(tasks: any[]) {
    (db.select as any).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue(tasks),
        }),
        orderBy: vi.fn().mockResolvedValue(tasks),
        innerJoin: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
      }),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/reports/daily — scopes data to requester's group; cross-group tasks are absent", async () => {
    setupDbWithTasks([groupATask]);
    const crossGroupTask = makeTask(2, GROUP_B);

    const res = await request(app)
      .get("/api/reports/daily?date=2026-12-31")
      .set("Authorization", "Bearer faketoken");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("tasks");
    const returnedIds = (res.body.tasks as any[]).map((t) => t.id);
    expect(returnedIds).toContain(groupATask.id);
    expect(returnedIds).not.toContain(crossGroupTask.id);
  });

  it("GET /api/reports/employee — scopes data to requester's group; cross-group tasks are absent", async () => {
    setupDbWithTasks([groupATask]);
    const crossGroupTask = makeTask(3, GROUP_B);

    const res = await request(app)
      .get("/api/reports/employee")
      .set("Authorization", "Bearer faketoken");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("tasks");
    const returnedIds = (res.body.tasks as any[]).map((t) => t.id);
    expect(returnedIds).not.toContain(crossGroupTask.id);
  });

  it("GET /api/reports/employee?employeeId — returns 403 when employeeId belongs to a different group", async () => {
    const crossGroupUserId = 42;
    (loadOwnedMembership as any).mockRejectedValue(crossGroupError());

    const res = await request(app)
      .get(`/api/reports/employee?employeeId=${crossGroupUserId}`)
      .set("Authorization", "Bearer faketoken");

    expect(res.status).toBe(403);
    expect(loadOwnedMembership).toHaveBeenCalledWith(crossGroupUserId, GROUP_A);
  });
});
