import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const GROUP_A = 1;
const OWNER_ID = 10;
const TARGET_USER_ID = 99;

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
    orderBy: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockResolvedValue([]),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
  };
  return {
    db: mockDb,
    usersTable: {}, groupMembershipsTable: {}, teamsTable: {},
    tasksTable: {}, taskAssigneesTable: {}, notificationsTable: {},
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
vi.mock("pino", () => ({ default: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) }) }));
vi.mock("pino-http", () => ({ default: () => (_req: any, _res: any, next: any) => next() }));

import app from "../app";
import { loadOwnedMembership } from "../lib/groupOwnership";

describe("Users routes — cross-group isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (loadOwnedMembership as any).mockRejectedValue(crossGroupError());
  });

  it("GET /api/users/:id — returns 403 when target user belongs to a different group", async () => {
    const res = await request(app)
      .get(`/api/users/${TARGET_USER_ID}`)
      .set("Authorization", "Bearer faketoken");

    expect(res.status).toBe(403);
    expect(loadOwnedMembership).toHaveBeenCalledWith(TARGET_USER_ID, GROUP_A);
  });

  it("PATCH /api/users/:id — returns 403 when target user belongs to a different group", async () => {
    const res = await request(app)
      .patch(`/api/users/${TARGET_USER_ID}`)
      .set("Authorization", "Bearer faketoken")
      .send({ fullName: "Hacked Name" });

    expect(res.status).toBe(403);
    expect(loadOwnedMembership).toHaveBeenCalledWith(TARGET_USER_ID, GROUP_A);
  });

  it("POST /api/users/:id/reset-password — returns 403 when target user belongs to a different group", async () => {
    const res = await request(app)
      .post(`/api/users/${TARGET_USER_ID}/reset-password`)
      .set("Authorization", "Bearer faketoken")
      .send({ newPassword: "newpass123" });

    expect(res.status).toBe(403);
    expect(loadOwnedMembership).toHaveBeenCalledWith(TARGET_USER_ID, GROUP_A);
  });

  it("PATCH /api/users/:id/disable — returns 403 when target user belongs to a different group", async () => {
    const res = await request(app)
      .patch(`/api/users/${TARGET_USER_ID}/disable`)
      .set("Authorization", "Bearer faketoken");

    expect(res.status).toBe(403);
    expect(loadOwnedMembership).toHaveBeenCalledWith(TARGET_USER_ID, GROUP_A);
  });
});
