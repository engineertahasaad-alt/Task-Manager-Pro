import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const teamsTable = pgTable("teams", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  inviteCode: text("invite_code").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Team = typeof teamsTable.$inferSelect;
