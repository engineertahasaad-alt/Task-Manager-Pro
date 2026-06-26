import { pgTable, serial, text, integer, timestamp, boolean, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { relations } from "drizzle-orm";

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id"),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  creatorId: integer("creator_id").notNull().references(() => usersTable.id),
  deadline: timestamp("deadline", { withTimezone: true }).notNull(),
  status: text("status", { enum: ["open", "completed", "approved", "reopened"] }).notNull().default("open"),
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

export const taskAssigneesTable = pgTable("task_assignees", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull().references(() => tasksTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.taskId, t.userId)]);

export const tasksRelations = relations(tasksTable, ({ one, many }) => ({
  creator: one(usersTable, { fields: [tasksTable.creatorId], references: [usersTable.id], relationName: "creator" }),
  taskAssignees: many(taskAssigneesTable),
}));

export const taskAssigneesRelations = relations(taskAssigneesTable, ({ one }) => ({
  task: one(tasksTable, { fields: [taskAssigneesTable.taskId], references: [tasksTable.id] }),
  user: one(usersTable, { fields: [taskAssigneesTable.userId], references: [usersTable.id] }),
}));

export const insertTaskSchema = createInsertSchema(tasksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;
export type TaskAssignee = typeof taskAssigneesTable.$inferSelect;
