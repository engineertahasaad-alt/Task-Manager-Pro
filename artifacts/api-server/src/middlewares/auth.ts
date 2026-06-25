import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db, usersTable, groupMembershipsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";

const JWT_SECRET = process.env.JWT_SECRET ?? process.env.SESSION_SECRET ?? "taskaya-secret-key";

export interface AuthUser {
  id: number;
  role: "owner" | "deputy" | "member";
  teamId: number | null;
  groupId: number | null;
  fullName: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(userId: number, activeGroupId?: number | null): string {
  return jwt.sign({ userId, activeGroupId: activeGroupId ?? null }, JWT_SECRET, { expiresIn: "7d" });
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number; activeGroupId?: number | null };
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId));
    if (!user || !user.isActive) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    let groupId: number | null = payload.activeGroupId ?? null;
    let role: AuthUser["role"] = "member";

    if (groupId != null) {
      const [membership] = await db
        .select()
        .from(groupMembershipsTable)
        .where(
          and(
            eq(groupMembershipsTable.userId, user.id),
            eq(groupMembershipsTable.groupId, groupId),
            eq(groupMembershipsTable.isActive, true)
          )
        );
      if (membership) {
        role = membership.role as AuthUser["role"];
      } else {
        groupId = null;
      }
    }

    if (groupId == null) {
      // Membership in token's group is missing/inactive — fall back to the
      // first active membership (never to legacy users.teamId/users.role).
      const [firstMembership] = await db
        .select()
        .from(groupMembershipsTable)
        .where(
          and(
            eq(groupMembershipsTable.userId, user.id),
            eq(groupMembershipsTable.isActive, true)
          )
        );
      if (firstMembership) {
        groupId = firstMembership.groupId;
        role = firstMembership.role as AuthUser["role"];
      }
      // groupId stays null — routes that require an active group will 403 themselves
    }

    req.user = { id: user.id, role, teamId: groupId, groupId, fullName: user.fullName };
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
