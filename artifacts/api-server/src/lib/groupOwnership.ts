import { db, tasksTable, groupMembershipsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

/**
 * Thrown when a resource exists but belongs to a different group than the requester.
 * Routes must NOT silently fall through — they catch this and return 403.
 */
export class GroupOwnershipError extends Error {
  readonly statusCode = 403;
  constructor() {
    super("Cross-group access denied");
    this.name = "GroupOwnershipError";
  }
}

/**
 * Asserts that `resourceGroupId` matches the requester's `userGroupId`.
 * Throws a `GroupOwnershipError` (→ 403) when there is a mismatch.
 *
 * Use after a raw "does this row exist?" lookup so callers can distinguish
 * "not found" (404) from "exists but wrong group" (403).
 */
export function assertGroupOwnership(resourceGroupId: number | null, userGroupId: number | null | undefined): void {
  if (userGroupId == null || resourceGroupId !== userGroupId) {
    throw new GroupOwnershipError();
  }
}

/**
 * Loads a task by id without any group filter.
 * Returns null if the task does not exist at all (caller should 404).
 * Call `assertGroupOwnership(task.teamId, req.user.groupId)` after this
 * to get a 403 when the task belongs to a different group.
 */
export async function loadTask(taskId: number) {
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, taskId));
  return task ?? null;
}

/**
 * Convenience: loads a task and immediately asserts group ownership.
 * Returns the task if it exists and belongs to `groupId`.
 * Returns null if the task does not exist (caller should 404).
 * Throws `GroupOwnershipError` if the task exists but belongs to a different group (→ 403).
 */
export async function loadOwnedTask(taskId: number, groupId: number | null | undefined) {
  if (groupId == null) throw new GroupOwnershipError();
  const task = await loadTask(taskId);
  if (!task) return null;
  assertGroupOwnership(task.teamId, groupId);
  return task;
}

/**
 * Loads a user by id without any group filter.
 * Returns null if the user does not exist at all (caller should 404).
 */
export async function loadUser(userId: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  return user ?? null;
}

/**
 * Convenience: loads a group membership and asserts it matches `groupId`.
 * Returns the membership if the user is a member of `groupId`.
 * Returns null if no membership row exists for the user at all.
 * Throws `GroupOwnershipError` if the user exists in a different group (→ 403).
 */
export async function loadOwnedMembership(userId: number, groupId: number | null | undefined) {
  if (groupId == null) throw new GroupOwnershipError();

  const [mem] = await db
    .select()
    .from(groupMembershipsTable)
    .where(and(eq(groupMembershipsTable.userId, userId), eq(groupMembershipsTable.groupId, groupId)));

  if (mem) return mem;

  const anyUser = await loadUser(userId);
  if (!anyUser) return null;

  throw new GroupOwnershipError();
}
