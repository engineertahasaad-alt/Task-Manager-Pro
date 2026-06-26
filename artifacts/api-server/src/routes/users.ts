import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, teamsTable, groupMembershipsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { CreateUserBody, UpdateUserBody, GetUserParams, UpdateUserParams, DisableUserParams, ResetUserPasswordBody, ResetUserPasswordParams } from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { serializeUser } from "./auth";
import { logAudit } from "../lib/audit";

const router = Router();

router.use(requireAuth);

router.get("/users", async (req, res): Promise<void> => {
  const activeGroupId = req.user!.groupId;

  // If a targetGroupId is provided, only managers of that group may request it (for delegation)
  const requestedGroupIdRaw = req.query.groupId;
  const targetGroupId = requestedGroupIdRaw != null ? parseInt(String(requestedGroupIdRaw), 10) : null;

  if (targetGroupId != null && !isNaN(targetGroupId) && targetGroupId !== activeGroupId) {
    // Verify requester is an active manager (owner or deputy) in the requested target group
    const [managerMembership] = await db
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
    if (!managerMembership) {
      res.status(403).json({ error: "You are not a manager in the requested group" });
      return;
    }

    const memberships = await db
      .select()
      .from(groupMembershipsTable)
      .where(
        and(
          eq(groupMembershipsTable.groupId, targetGroupId),
          eq(groupMembershipsTable.isActive, true),
          eq(groupMembershipsTable.pendingApproval, false)
        )
      );
    const userIds = memberships.map((m) => m.userId);
    if (userIds.length === 0) { res.json([]); return; }
    const users = await db.select().from(usersTable).orderBy(usersTable.fullName);
    const filtered = users.filter((u) => userIds.includes(u.id));
    const membershipMap = new Map(memberships.map((m) => [m.userId, m]));
    res.json(filtered.map((u) => {
      const mem = membershipMap.get(u.id);
      return serializeUser(u, mem?.role, targetGroupId);
    }));
    return;
  }

  // Default: return members of the requester's active group
  const groupId = activeGroupId;
  if (groupId == null) {
    res.json([]);
    return;
  }
  const memberships = await db
    .select()
    .from(groupMembershipsTable)
    .where(eq(groupMembershipsTable.groupId, groupId));

  const userIds = memberships.map((m) => m.userId);
  if (userIds.length === 0) { res.json([]); return; }

  const users = await db.select().from(usersTable).orderBy(usersTable.fullName);
  const filtered = users.filter((u) => userIds.includes(u.id));
  const membershipMap = new Map(memberships.map((m) => [m.userId, m]));

  res.json(filtered.map((u) => {
    const mem = membershipMap.get(u.id);
    return serializeUser(u, mem?.role, groupId);
  }));
});

router.get("/team/info", async (req, res): Promise<void> => {
  const groupId = req.user!.groupId;
  if (!groupId) { res.status(404).json({ error: "No team" }); return; }
  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, groupId));
  if (!team) { res.status(404).json({ error: "Team not found" }); return; }
  res.json({ id: team.id, name: team.name, inviteCode: team.inviteCode });
});

router.post("/users", requireRole("owner", "deputy"), async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { fullName, mobile, role } = parsed.data;
  const groupId = req.user!.groupId;

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.mobile, mobile));
  if (existing) {
    res.status(400).json({ error: "Mobile number already exists" });
    return;
  }

  // Only one deputy allowed per group
  if (role === "deputy" && groupId != null) {
    const deputies = await db
      .select()
      .from(groupMembershipsTable)
      .where(and(eq(groupMembershipsTable.groupId, groupId), eq(groupMembershipsTable.role, "deputy")));
    if (deputies.length > 0) {
      res.status(400).json({ error: "A deputy already exists in this group" });
      return;
    }
  }

  const passwordHash = await bcrypt.hash("123", 10);
  const [user] = await db
    .insert(usersTable)
    .values({ fullName, mobile, role, passwordHash, mustChangePassword: true, teamId: groupId })
    .returning();

  if (groupId != null) {
    await db.insert(groupMembershipsTable).values({
      userId: user.id,
      groupId,
      role,
      isActive: true,
      pendingApproval: false,
    });
  }

  await logAudit("user_created", req.user!.id, groupId, "user", user.id, { fullName, role });
  res.status(201).json(serializeUser(user, role, groupId));
});

router.get("/users/:id", async (req, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const groupId = req.user!.groupId;
  if (groupId == null) { res.status(403).json({ error: "No active group" }); return; }

  // Verify target user is a member of the requester's active group
  const [mem] = await db.select().from(groupMembershipsTable).where(
    and(eq(groupMembershipsTable.userId, params.data.id), eq(groupMembershipsTable.groupId, groupId))
  );
  if (!mem) {
    res.status(404).json({ error: "User not found in this group" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(serializeUser(user, mem.role, groupId));
});

router.patch("/users/:id", requireRole("owner", "deputy"), async (req, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const groupId = req.user!.groupId;
  if (groupId == null) { res.status(403).json({ error: "No active group" }); return; }

  // Verify target user is a member of the requester's active group
  const [existingMem] = await db.select().from(groupMembershipsTable).where(
    and(eq(groupMembershipsTable.userId, params.data.id), eq(groupMembershipsTable.groupId, groupId))
  );
  if (!existingMem) {
    res.status(404).json({ error: "User not found in this group" });
    return;
  }

  const updateData: any = { ...parsed.data };
  delete updateData.role;

  const [user] = await db
    .update(usersTable)
    .set(updateData)
    .where(eq(usersTable.id, params.data.id))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (parsed.data.role && groupId != null) {
    await db
      .update(groupMembershipsTable)
      .set({ role: parsed.data.role })
      .where(
        and(
          eq(groupMembershipsTable.userId, params.data.id),
          eq(groupMembershipsTable.groupId, groupId)
        )
      );
    await logAudit("role_changed", req.user!.id, groupId, "user", params.data.id, { newRole: parsed.data.role });
  }

  let role = user.role;
  if (groupId != null) {
    const [mem] = await db.select().from(groupMembershipsTable).where(
      and(eq(groupMembershipsTable.userId, user.id), eq(groupMembershipsTable.groupId, groupId))
    );
    if (mem) role = mem.role;
  }

  res.json(serializeUser(user, role, groupId));
});

router.post("/users/:id/reset-password", requireRole("owner", "deputy"), async (req, res): Promise<void> => {
  const params = ResetUserPasswordParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = ResetUserPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const groupId = req.user!.groupId;
  if (groupId == null) { res.status(403).json({ error: "No active group" }); return; }

  // Verify target user is a member of the requester's active group
  const [mem] = await db.select().from(groupMembershipsTable).where(
    and(eq(groupMembershipsTable.userId, params.data.id), eq(groupMembershipsTable.groupId, groupId))
  );
  if (!mem) {
    res.status(404).json({ error: "User not found in this group" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await db.update(usersTable).set({ passwordHash, mustChangePassword: true }).where(eq(usersTable.id, user.id));
  await logAudit("user_password_changed", req.user!.id, groupId, "user", user.id, {
    method: "admin_reset",
    targetUserId: user.id,
  });
  res.json({ message: "Password reset. User must change password on next login." });
});

router.patch("/users/:id/disable", requireRole("owner", "deputy"), async (req, res): Promise<void> => {
  const params = DisableUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const groupId = req.user!.groupId;

  if (groupId != null) {
    const [mem] = await db
      .select()
      .from(groupMembershipsTable)
      .where(and(eq(groupMembershipsTable.userId, params.data.id), eq(groupMembershipsTable.groupId, groupId)));
    if (!mem) {
      res.status(404).json({ error: "User not found in this group" });
      return;
    }
    const [updated] = await db
      .update(groupMembershipsTable)
      .set({ isActive: !mem.isActive })
      .where(and(eq(groupMembershipsTable.userId, params.data.id), eq(groupMembershipsTable.groupId, groupId)))
      .returning();
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
    await logAudit("user_deactivated", req.user!.id, groupId, "user", params.data.id, { isActive: updated.isActive });
    res.json(serializeUser(user, updated.role, groupId));
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const [updated] = await db
    .update(usersTable)
    .set({ isActive: !user.isActive })
    .where(eq(usersTable.id, params.data.id))
    .returning();
  res.json(serializeUser(updated, undefined, groupId));
});

// Join requests
router.get("/team/join-requests", requireRole("owner", "deputy"), async (req, res): Promise<void> => {
  const groupId = req.user!.groupId;
  if (!groupId) { res.json([]); return; }
  const pending = await db
    .select()
    .from(groupMembershipsTable)
    .where(and(eq(groupMembershipsTable.groupId, groupId), eq(groupMembershipsTable.pendingApproval, true)));

  const result = await Promise.all(pending.map(async (m) => {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, m.userId));
    return user ? serializeUser(user, m.role, groupId) : null;
  }));

  res.json(result.filter(Boolean));
});

router.post("/team/join-requests/:id/approve", requireRole("owner", "deputy"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const groupId = req.user!.groupId;
  if (!groupId) { res.status(400).json({ error: "No active group" }); return; }

  const [mem] = await db
    .update(groupMembershipsTable)
    .set({ isActive: true, pendingApproval: false })
    .where(and(eq(groupMembershipsTable.userId, id), eq(groupMembershipsTable.groupId, groupId)))
    .returning();
  if (!mem) { res.status(404).json({ error: "Request not found" }); return; }

  // Also activate user account if it was pending
  await db
    .update(usersTable)
    .set({ isActive: true, pendingApproval: false })
    .where(eq(usersTable.id, id));

  await logAudit("member_approved", req.user!.id, groupId, "user", id, {});
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  res.json(serializeUser(user, mem.role, groupId));
});

router.post("/team/join-requests/:id/reject", requireRole("owner", "deputy"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const groupId = req.user!.groupId;
  if (!groupId) { res.status(400).json({ error: "No active group" }); return; }

  const [mem] = await db
    .select()
    .from(groupMembershipsTable)
    .where(and(eq(groupMembershipsTable.userId, id), eq(groupMembershipsTable.groupId, groupId)));
  if (!mem) { res.status(404).json({ error: "Request not found" }); return; }

  await db.delete(groupMembershipsTable).where(
    and(eq(groupMembershipsTable.userId, id), eq(groupMembershipsTable.groupId, groupId))
  );

  await logAudit("member_removed", req.user!.id, groupId, "user", id, { reason: "join_request_rejected" });

  // Check if user has other memberships; if not, soft-delete
  const otherMemberships = await db
    .select()
    .from(groupMembershipsTable)
    .where(eq(groupMembershipsTable.userId, id));
  if (otherMemberships.length === 0) {
    await db.delete(usersTable).where(eq(usersTable.id, id));
  }

  res.json({ message: "Request rejected" });
});

// Regenerate invite code (owner only)
router.post("/team/regenerate-invite", requireRole("owner"), async (req, res): Promise<void> => {
  const groupId = req.user!.groupId;
  if (!groupId) { res.status(404).json({ error: "No team" }); return; }
  const { randomBytes } = await import("crypto");
  const newCode = randomBytes(4).toString("hex").toUpperCase();
  const [team] = await db.update(teamsTable).set({ inviteCode: newCode }).where(eq(teamsTable.id, groupId)).returning();
  res.json({ inviteCode: team.inviteCode });
});

export default router;
