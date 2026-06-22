import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateUserBody, UpdateUserBody, GetUserParams, UpdateUserParams, DisableUserParams, ResetUserPasswordBody, ResetUserPasswordParams } from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { serializeUser } from "./auth";

const router = Router();

router.use(requireAuth);

router.get("/users", async (_req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(usersTable.fullName);
  res.json(users.map(serializeUser));
});

router.post("/users", requireRole("owner", "deputy"), async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { fullName, mobile, role } = parsed.data;

  // Check if mobile already exists
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.mobile, mobile));
  if (existing) {
    res.status(400).json({ error: "Mobile number already exists" });
    return;
  }

  // Only one deputy allowed
  if (role === "deputy") {
    const [existingDeputy] = await db.select().from(usersTable).where(eq(usersTable.role, "deputy"));
    if (existingDeputy) {
      res.status(400).json({ error: "A deputy already exists" });
      return;
    }
  }

  const passwordHash = await bcrypt.hash("123", 10);
  const [user] = await db
    .insert(usersTable)
    .values({ fullName, mobile, role, passwordHash, mustChangePassword: true })
    .returning();
  res.status(201).json(serializeUser(user));
});

router.get("/users/:id", async (req, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(serializeUser(user));
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

  const [user] = await db
    .update(usersTable)
    .set(parsed.data)
    .where(eq(usersTable.id, params.data.id))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(serializeUser(user));
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
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await db.update(usersTable).set({ passwordHash, mustChangePassword: true }).where(eq(usersTable.id, user.id));
  res.json({ message: "Password reset. User must change password on next login." });
});

router.patch("/users/:id/disable", requireRole("owner", "deputy"), async (req, res): Promise<void> => {
  const params = DisableUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
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
  res.json(serializeUser(updated));
});

export default router;
