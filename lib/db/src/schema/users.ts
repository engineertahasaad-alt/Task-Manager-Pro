import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id"),
  fullName: text("full_name").notNull(),
  mobile: text("mobile").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["owner", "deputy", "member"] }).notNull().default("member"),
  isActive: boolean("is_active").notNull().default(true),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  pendingApproval: boolean("pending_approval").notNull().default(false),
  notifyReminder24h: boolean("notify_reminder_24h").notNull().default(true),
  notifyReminder1h: boolean("notify_reminder_1h").notNull().default(true),
  notifyReminder10m: boolean("notify_reminder_10m").notNull().default(true),
  notifyOverdue: boolean("notify_overdue").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
