import { pgTable, serial, text, integer, timestamp, boolean, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { teamsTable } from "./teams";
import { relations } from "drizzle-orm";

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id"),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  creatorId: integer("creator_id").notNull().references(() => usersTable.id),
  deadline: timestamp("deadline", { withTimezone: true }).notNull(),
  status: text("status", { enum: ["open", "completed", "approved", "reopened"] }).notNull().default("open"),
  parentTaskId: integer("parent_task_id"),
  reassignToId: integer("reassign_to_id").references(() => usersTable.id),
  reassignFromId: integer("reassign_from_id").references(() => usersTable.id),
  reassignStatus: text("reassign_status", { enum: ["pending", "approved", "rejected"] }),
  reminder24hSent: boolean("reminder_24h_sent").notNull().default(false),
  reminder1hSent: boolean("reminder_1h_sent").notNull().default(false),
  reminder10mSent: boolean("reminder_10m_sent").notNull().default(false),
  overdueReminderSent: boolean("overdue_reminder_sent").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const taskDelegationsTable = pgTable("task_delegations", {
  id: serial("id").primaryKey(),
  originalTaskId: integer("original_task_id").notNull().references(() => tasksTable.id, { onDelete: "cascade" }),
  delegatedTaskId: integer("delegated_task_id").notNull().references(() => tasksTable.id, { onDelete: "cascade" }),
  delegatedByUserId: integer("delegated_by_user_id").notNull().references(() => usersTable.id),
  sourceGroupId: integer("source_group_id").notNull().references(() => teamsTable.id),
  targetGroupId: integer("target_group_id").notNull().references(() => teamsTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const taskAssigneesTable = pgTable("task_assignees", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull().references(() => tasksTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.taskId, t.userId)]);

export const tasksRelations = relations(tasksTable, ({ one, many }) => ({
  creator: one(usersTable, { fields: [tasksTable.creatorId], references: [usersTable.id], relationName: "creator" }),
  taskAssignees: many(taskAssigneesTable),
  delegations: many(taskDelegationsTable, { relationName: "originalTask" }),
  childDelegations: many(taskDelegationsTable, { relationName: "delegatedTask" }),
}));

export const taskAssigneesRelations = relations(taskAssigneesTable, ({ one }) => ({
  task: one(tasksTable, { fields: [taskAssigneesTable.taskId], references: [tasksTable.id] }),
  user: one(usersTable, { fields: [taskAssigneesTable.userId], references: [usersTable.id] }),
}));

export const taskDelegationsRelations = relations(taskDelegationsTable, ({ one }) => ({
  originalTask: one(tasksTable, { fields: [taskDelegationsTable.originalTaskId], references: [tasksTable.id], relationName: "originalTask" }),
  delegatedTask: one(tasksTable, { fields: [taskDelegationsTable.delegatedTaskId], references: [tasksTable.id], relationName: "delegatedTask" }),
  delegatedBy: one(usersTable, { fields: [taskDelegationsTable.delegatedByUserId], references: [usersTable.id] }),
}));

export const insertTaskSchema = createInsertSchema(tasksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;
export type TaskAssignee = typeof taskAssigneesTable.$inferSelect;
export type TaskDelegation = typeof taskDelegationsTable.$inferSelect;
