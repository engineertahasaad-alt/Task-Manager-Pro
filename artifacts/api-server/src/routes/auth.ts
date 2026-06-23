import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, teamsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { LoginBody, ChangePasswordBody, SignupBody, ForgotPasswordBody } from "@workspace/api-zod";
import { signToken, requireAuth } from "../middlewares/auth";
import { randomBytes } from "crypto";

const router = Router();

function serializeUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    teamId: user.teamId,
    fullName: user.fullName,
    mobile: user.mobile,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
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
  res.json({ message: "Password reset successfully. You can now sign in with your new password." });
});

router.post("/auth/signup", async (req, res): Promise<void> => {
  const parsed = SignupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { fullName, mobile, password, inviteCode, teamName } = parsed.data as any;
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.mobile, mobile));
  if (existing) {
    res.status(409).json({ error: "Mobile number already registered" });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);

  if (inviteCode) {
    // Joining an existing team via invite code
    const [team] = await db.select().from(teamsTable).where(eq(teamsTable.inviteCode, inviteCode.toUpperCase()));
    if (!team) {
      res.status(404).json({ error: "Invalid invite code" });
      return;
    }
    const [user] = await db.insert(usersTable).values({
      fullName, mobile, passwordHash,
      teamId: team.id,
      role: "member",
      mustChangePassword: false,
    }).returning();
    const token = signToken(user.id);
    res.status(201).json({ token, user: serializeUser(user), team: { id: team.id, name: team.name, inviteCode: team.inviteCode } });
  } else {
    // Creating a new team — user becomes owner
    const name = teamName?.trim() || `${fullName}'s Team`;
    const invCode = randomBytes(4).toString("hex").toUpperCase();
    const [team] = await db.insert(teamsTable).values({ name, inviteCode: invCode }).returning();
    const [user] = await db.insert(usersTable).values({
      fullName, mobile, passwordHash,
      teamId: team.id,
      role: "owner",
      mustChangePassword: false,
    }).returning();
    const token = signToken(user.id);
    res.status(201).json({ token, user: serializeUser(user), team: { id: team.id, name: team.name, inviteCode: team.inviteCode } });
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
  const token = signToken(user.id);
  res.json({ token, user: serializeUser(user) });
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
  res.json({ message: "Password changed successfully" });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(serializeUser(user));
});

export { serializeUser };
export default router;
