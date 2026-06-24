import { pgTable, serial, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { relations } from "drizzle-orm";

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id"),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  assigneeId: integer("assignee_id").notNull().references(() => usersTable.id),
  creatorId: integer("creator_id").notNull().references(() => usersTable.id),
  deadline: timestamp("deadline", { withTimezone: true }).notNull(),
  status: text("status", { enum: ["open", "completed", "approved", "reopened"] }).notNull().default("open"),
  reassignToId: integer("reassign_to_id").references(() => usersTable.id),
  reassignStatus: text("reassign_status", { enum: ["pending", "approved", "rejected"] }),
  reminder24hSent: boolean("reminder_24h_sent").notNull().default(false),
  reminder1hSent: boolean("reminder_1h_sent").notNull().default(false),
  reminder10mSent: boolean("reminder_10m_sent").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const tasksRelations = relations(tasksTable, ({ one }) => ({
  assignee: one(usersTable, { fields: [tasksTable.assigneeId], references: [usersTable.id], relationName: "assignee" }),
  creator: one(usersTable, { fields: [tasksTable.creatorId], references: [usersTable.id], relationName: "creator" }),
}));

export const insertTaskSchema = createInsertSchema(tasksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;
