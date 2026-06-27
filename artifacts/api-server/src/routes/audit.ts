import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth";

const router = Router();

router.get("/audit-logs", requireAuth, requireRole("owner", "deputy"), async (req, res): Promise<void> => {
  const groupId = req.user!.groupId;
  if (!groupId) {
    res.status(403).json({ error: "No active group" });
    return;
  }

  const { startDate, endDate, action, actorId, page = "1", limit = "50" } = req.query as Record<string, string | undefined>;

  const pageNum = Math.max(1, parseInt(page ?? "1", 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit ?? "50", 10) || 50));
  const offset = (pageNum - 1) * limitNum;

  const conditions: string[] = ["al.group_id = $1"];
  const params: unknown[] = [groupId];
  let paramIdx = 2;

  if (startDate) {
    conditions.push(`al.created_at >= $${paramIdx++}`);
    params.push(new Date(startDate));
  }
  if (endDate) {
    conditions.push(`al.created_at <= $${paramIdx++}`);
    params.push(new Date(endDate));
  }
  if (action) {
    conditions.push(`al.action = $${paramIdx++}`);
    params.push(action);
  }
  if (actorId) {
    const aid = parseInt(actorId, 10);
    if (!isNaN(aid)) {
      conditions.push(`al.actor_id = $${paramIdx++}`);
      params.push(aid);
    }
  }

  const where = conditions.join(" AND ");

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM audit_logs al WHERE ${where}`,
    params
  );
  const total = parseInt(countResult.rows[0]?.count ?? "0", 10);

  const rows = await pool.query(
    `SELECT
       al.id,
       al.group_id AS "groupId",
       al.actor_id AS "actorId",
       al.action,
       al.target_type AS "targetType",
       al.target_id AS "targetId",
       al.metadata,
       al.created_at AS "createdAt",
       u.full_name AS "actorName"
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.actor_id
     WHERE ${where}
     ORDER BY al.created_at DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    [...params, limitNum, offset]
  );

  res.json({
    data: rows.rows,
    total,
    page: pageNum,
    limit: limitNum,
    pages: Math.ceil(total / limitNum),
  });
});

export default router;
