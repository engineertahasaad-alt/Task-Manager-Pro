import { pool } from "@workspace/db";

export type AuditAction =
  | "user_created"
  | "user_login"
  | "user_password_changed"
  | "user_deactivated"
  | "group_created"
  | "member_joined"
  | "member_approved"
  | "member_removed"
  | "role_changed"
  | "task_created"
  | "task_assigned"
  | "task_delegated"
  | "task_completed"
  | "task_approved"
  | "task_reopened"
  | "task_reassign_requested"
  | "task_reassign_rejected";

/**
 * Write an audit entry. Throws on failure — callers on critical mutation paths
 * should let the error propagate so the mutation cannot commit without a record.
 *
 * For purely informational events (e.g. login) where blocking the user is
 * unacceptable, catch the error explicitly at the call site.
 */
export async function logAudit(
  action: AuditAction,
  actorId: number | null | undefined,
  groupId: number | null | undefined,
  targetType: string | null,
  targetId: number | null | undefined,
  metadata?: Record<string, unknown>
): Promise<void> {
  await pool.query(
    `INSERT INTO audit_logs (group_id, actor_id, action, target_type, target_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      groupId ?? null,
      actorId ?? null,
      action,
      targetType ?? null,
      targetId ?? null,
      metadata ? JSON.stringify(metadata) : null,
    ]
  );
}
