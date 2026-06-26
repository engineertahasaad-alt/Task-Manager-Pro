import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, teamsTable, groupMembershipsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { LoginBody, ChangePasswordBody, SignupBody, ForgotPasswordBody } from "@workspace/api-zod";
import { signToken, requireAuth } from "../middlewares/auth";
import { randomBytes } from "crypto";
import { z } from "zod";
import { logAudit } from "../lib/audit";

const router = Router();

function serializeUser(user: typeof usersTable.$inferSelect, role?: string, groupId?: number | null) {
  return {
    id: user.id,
    teamId: groupId ?? user.teamId,
    groupId: groupId ?? user.teamId,
    fullName: user.fullName,
    mobile: user.mobile,
    role: (role ?? user.role) as string,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    pendingApproval: user.pendingApproval,
    createdAt: user.createdAt.toISOString(),
  };
}

router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const parsed = ForgotPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { mobile, newPassword } = parsed.data;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.mobile, mobile));
  if (!user) {
    res.status(404).json({ error: "No account found with that mobile number" });
    return;
  }
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(usersTable).set({ passwordHash, mustChangePassword: false }).where(eq(usersTable.id, user.id));
  await logAudit("user_password_changed", user.id, user.teamId, "user", user.id, { method: "forgot_password" });
  res.json({ message: "Password reset successfully. You can now sign in with your new password." });
});

router.post("/auth/signup", async (req, res): Promise<void> => {
  const parsed = SignupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { fullName, mobile, password, inviteCode, teamName } = parsed.data as any;

  if (inviteCode) {
    const [team] = await db.select().from(teamsTable).where(eq(teamsTable.inviteCode, inviteCode.toUpperCase()));
    if (!team) {
      res.status(404).json({ error: "Invalid invite code" });
      return;
    }

    // Check if user already exists (existing user joining a second group)
    const [existingUser] = await db.select().from(usersTable).where(eq(usersTable.mobile, mobile));
    if (existingUser) {
      // Require password verification — anyone with a known mobile + invite code
      // must prove ownership of the account before a membership is created.
      const passwordValid = await bcrypt.compare(password, existingUser.passwordHash);
      if (!passwordValid) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }
      if (!existingUser.isActive) {
        res.status(401).json({ error: "Account is inactive" });
        return;
      }

      // Existing user joining another group — create a membership row
      const [existingMembership] = await db
        .select()
        .from(groupMembershipsTable)
        .where(
          and(
            eq(groupMembershipsTable.userId, existingUser.id),
            eq(groupMembershipsTable.groupId, team.id)
          )
        );
      if (existingMembership) {
        res.status(409).json({ error: "You are already a member of this group" });
        return;
      }
      await db.insert(groupMembershipsTable).values({
        userId: existingUser.id,
        groupId: team.id,
        role: "member",
        isActive: false,
        pendingApproval: true,
      });
      await logAudit("member_joined", existingUser.id, team.id, "user", existingUser.id, { groupName: team.name, pendingApproval: true });
      res.status(201).json({
        pendingApproval: true,
        user: serializeUser(existingUser, "member", team.id),
        team: { id: team.id, name: team.name },
      });
      return;
    }

    // New user joining via invite code
    const passwordHash = await bcrypt.hash(password, 10);
    const [user] = await db.insert(usersTable).values({
      fullName, mobile, passwordHash,
      teamId: team.id,
      role: "member",
      mustChangePassword: false,
      isActive: false,
      pendingApproval: true,
    }).returning();
    await db.insert(groupMembershipsTable).values({
      userId: user.id,
      groupId: team.id,
      role: "member",
      isActive: false,
      pendingApproval: true,
    });
    await logAudit("user_created", user.id, team.id, "user", user.id, { fullName, role: "member" });
    await logAudit("member_joined", user.id, team.id, "user", user.id, { groupName: team.name, pendingApproval: true });
    res.status(201).json({ pendingApproval: true, user: serializeUser(user, "member", team.id), team: { id: team.id, name: team.name } });
  } else {
    // Creating a new team — user becomes owner
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.mobile, mobile));
    if (existing) {
      res.status(409).json({ error: "Mobile number already registered" });
      return;
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const name = teamName?.trim() || `${fullName}'s Team`;
    const invCode = randomBytes(4).toString("hex").toUpperCase();
    const [team] = await db.insert(teamsTable).values({ name, inviteCode: invCode }).returning();
    const [user] = await db.insert(usersTable).values({
      fullName, mobile, passwordHash,
      teamId: team.id,
      role: "owner",
      mustChangePassword: false,
    }).returning();
    await db.insert(groupMembershipsTable).values({
      userId: user.id,
      groupId: team.id,
      role: "owner",
      isActive: true,
      pendingApproval: false,
    });
    await logAudit("group_created", user.id, team.id, "group", team.id, { groupName: team.name });
    await logAudit("user_created", user.id, team.id, "user", user.id, { fullName, role: "owner" });
    const token = signToken(user.id, team.id);
    res.status(201).json({
      token,
      user: serializeUser(user, "owner", team.id),
      team: { id: team.id, name: team.name, inviteCode: team.inviteCode },
      groups: [{ id: team.id, name: team.name, role: "owner" }],
      activeGroupId: team.id,
    });
  }
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { mobile, password } = parsed.data;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.mobile, mobile));
  if (!user || !user.isActive) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // Get all group memberships for this user
  const memberships = await db
    .select({ groupId: groupMembershipsTable.groupId, role: groupMembershipsTable.role })
    .from(groupMembershipsTable)
    .where(
      and(
        eq(groupMembershipsTable.userId, user.id),
        eq(groupMembershipsTable.isActive, true)
      )
    );

  const activeGroupId = memberships[0]?.groupId ?? user.teamId ?? null;
  const activeRole = memberships[0]?.role ?? user.role;
  const token = signToken(user.id, activeGroupId);

  const groups = await Promise.all(
    memberships.map(async (m) => {
      const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, m.groupId));
      return team ? { id: team.id, name: team.name, role: m.role } : null;
    })
  );

  try {
    await logAudit("user_login", user.id, activeGroupId, "user", user.id, { mobile: user.mobile });
  } catch {
    /* best-effort: login must not fail because of an audit write error */
  }
  res.json({
    token,
    user: serializeUser(user, activeRole, activeGroupId),
    groups: groups.filter(Boolean),
    activeGroupId,
  });
});

router.patch("/auth/switch-group", requireAuth, async (req, res): Promise<void> => {
  const groupId = Number(req.body?.groupId);
  if (!groupId || isNaN(groupId)) {
    res.status(400).json({ error: "groupId is required" });
    return;
  }

  const [membership] = await db
    .select()
    .from(groupMembershipsTable)
    .where(
      and(
        eq(groupMembershipsTable.userId, req.user!.id),
        eq(groupMembershipsTable.groupId, groupId),
        eq(groupMembershipsTable.isActive, true)
      )
    );

  if (!membership) {
    res.status(403).json({ error: "Not a member of this group" });
    return;
  }

  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, groupId));
  const token = signToken(req.user!.id, groupId);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));

  res.json({
    token,
    user: serializeUser(user, membership.role, groupId),
    activeGroupId: groupId,
    group: team ? { id: team.id, name: team.name } : null,
  });
});

router.get("/auth/groups", requireAuth, async (req, res): Promise<void> => {
  const memberships = await db
    .select()
    .from(groupMembershipsTable)
    .where(
      and(
        eq(groupMembershipsTable.userId, req.user!.id),
        eq(groupMembershipsTable.isActive, true)
      )
    );

  const groups = await Promise.all(
    memberships.map(async (m) => {
      const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, m.groupId));
      return team ? { id: team.id, name: team.name, role: m.role, isActive: m.groupId === req.user!.groupId } : null;
    })
  );

  res.json(groups.filter(Boolean));
});

router.post("/auth/change-password", requireAuth, async (req, res): Promise<void> => {
  const parsed = ChangePasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { currentPassword, newPassword } = parsed.data;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(usersTable).set({ passwordHash, mustChangePassword: false }).where(eq(usersTable.id, user.id));
  await logAudit("user_password_changed", req.user!.id, req.user!.groupId, "user", user.id, {});
  res.json({ message: "Password changed successfully" });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(serializeUser(user, req.user!.role, req.user!.groupId));
});

export { serializeUser };
export default router;
