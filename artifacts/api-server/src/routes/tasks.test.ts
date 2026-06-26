import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const GROUP_A = 1;
const GROUP_B = 2;
const OWNER_ID = 10;

function crossGroupError() {
  const err = new Error("Cross-group access denied") as any;
  err.statusCode = 403;
  return err;
}

vi.mock("../middlewares/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: OWNER_ID, role: "owner", groupId: GROUP_A, teamId: GROUP_A, fullName: "Owner" };
    next();
  },
  requireRole: (..._roles: string[]) => (_req: any, _res: any, next: any) => next(),
  signToken: vi.fn(),
  JWT_SECRET: "test-secret",
}));

vi.mock("@workspace/db", () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
    innerJoin: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockResolvedValue([]),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  };
  return {
    db: mockDb,
    tasksTable: {}, usersTable: {}, groupMembershipsTable: {},
    attachmentsTable: {}, messagesTable: {}, notificationsTable: {},
    taskAssigneesTable: {}, taskDelegationsTable: {}, teamsTable: {},
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

vi.mock("../lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("../lib/pushNotifications", () => ({ sendPushToUser: vi.fn() }));
vi.mock("pino", () => ({ default: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) }) }));
vi.mock("pino-http", () => ({ default: () => (_req: any, _res: any, next: any) => next() }));

import app from "../app";
import { loadOwnedTask } from "../lib/groupOwnership";
import { db } from "@workspace/db";

describe("Tasks routes — cross-group isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (db.select as any).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
        innerJoin: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
        orderBy: vi.fn().mockResolvedValue([]),
      }),
    });

    (db.update as any).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
      }),
    });
  });

  it("GET /api/tasks/:id — returns 403 when task belongs to a different group", async () => {
    (loadOwnedTask as any).mockRejectedValue(crossGroupError());

    const res = await request(app)
      .get("/api/tasks/999")
      .set("Authorization", "Bearer faketoken");

    expect(res.status).toBe(403);
    expect(loadOwnedTask).toHaveBeenCalledWith(999, GROUP_A);
  });

  it("PATCH /api/tasks/:id — returns 403 when task belongs to a different group", async () => {
    (loadOwnedTask as any).mockRejectedValue(crossGroupError());

    const res = await request(app)
      .patch("/api/tasks/999")
      .set("Authorization", "Bearer faketoken")
      .send({ title: "Hacked title" });

    expect(res.status).toBe(403);
    expect(loadOwnedTask).toHaveBeenCalledWith(999, GROUP_A);
  });

  it("PATCH /api/tasks/:id/complete — returns 403 when task belongs to a different group", async () => {
    (loadOwnedTask as any).mockRejectedValue(crossGroupError());

    const res = await request(app)
      .patch("/api/tasks/999/complete")
      .set("Authorization", "Bearer faketoken");

    expect(res.status).toBe(403);
    expect(loadOwnedTask).toHaveBeenCalledWith(999, GROUP_A);
  });

  it("PATCH /api/tasks/:id/approve — returns 403 when task belongs to a different group", async () => {
    (loadOwnedTask as any).mockRejectedValue(crossGroupError());

    const res = await request(app)
      .patch("/api/tasks/999/approve")
      .set("Authorization", "Bearer faketoken");

    expect(res.status).toBe(403);
    expect(loadOwnedTask).toHaveBeenCalledWith(999, GROUP_A);
  });

  it("PATCH /api/tasks/:id/reopen — returns 403 when task belongs to a different group", async () => {
    (loadOwnedTask as any).mockRejectedValue(crossGroupError());

    const res = await request(app)
      .patch("/api/tasks/999/reopen")
      .set("Authorization", "Bearer faketoken");

    expect(res.status).toBe(403);
    expect(loadOwnedTask).toHaveBeenCalledWith(999, GROUP_A);
  });

  it("POST /api/tasks/:id/delegate — returns 403 when source task belongs to a different group", async () => {
    (loadOwnedTask as any).mockRejectedValue(crossGroupError());

    const res = await request(app)
      .post("/api/tasks/999/delegate")
      .set("Authorization", "Bearer faketoken")
      .send({ targetGroupId: GROUP_B, assigneeIds: [42] });

    expect(res.status).toBe(403);
    expect(loadOwnedTask).toHaveBeenCalledWith(999, GROUP_A);
  });
});
