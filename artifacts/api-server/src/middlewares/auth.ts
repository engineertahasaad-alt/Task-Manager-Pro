import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const JWT_SECRET = process.env.JWT_SECRET ?? process.env.SESSION_SECRET ?? "taskaya-secret-key";

export interface AuthUser {
  id: number;
  role: "owner" | "deputy" | "member";
  teamId: number | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(userId: number): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number };
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId));
    if (!user || !user.isActive) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    req.user = { id: user.id, role: user.role as AuthUser["role"], teamId: user.teamId ?? null };
    next();
  } catch (err) {
    logger.warn({ err }, "JWT verification failed");
    res.status(401).json({ error: "Unauthorized" });
  }
}

export function requireRole(...roles: Array<"owner" | "deputy" | "member">) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

export { JWT_SECRET };
