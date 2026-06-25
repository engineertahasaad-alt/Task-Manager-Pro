import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { teamsTable } from "./teams";

export const groupMembershipsTable = pgTable("group_memberships", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  groupId: integer("group_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["owner", "deputy", "member"] }).notNull().default("member"),
  isActive: boolean("is_active").notNull().default(true),
  pendingApproval: boolean("pending_approval").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertGroupMembershipSchema = createInsertSchema(groupMembershipsTable).omit({ id: true, createdAt: true });
export type InsertGroupMembership = z.infer<typeof insertGroupMembershipSchema>;
export type GroupMembership = typeof groupMembershipsTable.$inferSelect;
