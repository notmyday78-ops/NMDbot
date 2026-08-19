"use strict";
import { eq, and, desc } from "drizzle-orm";
import { getDatabase } from "../database/connection";
import { auditLogs } from "../database/schema";
export class AuditLogger {
  async logAction(data) {
    const db = getDatabase();
    try {
      await db.insert(auditLogs).values({
        action: data.action,
        userId: data.userId,
        guildId: data.guildId,
        targetId: data.targetId,
        details: data.details
      });
    } catch (error) {
      console.error("Failed to log audit action:", error);
    }
  }
  async getAuditLogs(guildId, limit = 50) {
    const db = getDatabase();
    return db.select().from(auditLogs).where(eq(auditLogs.guildId, guildId)).orderBy(desc(auditLogs.createdAt)).limit(limit);
  }
  async getUserAuditLogs(guildId, userId, limit = 50) {
    const db = getDatabase();
    return db.select().from(auditLogs).where(and(eq(auditLogs.guildId, guildId), eq(auditLogs.userId, userId))).orderBy(desc(auditLogs.createdAt)).limit(limit);
  }
  async getTargetAuditLogs(guildId, targetId, limit = 50) {
    const db = getDatabase();
    return db.select().from(auditLogs).where(and(eq(auditLogs.guildId, guildId), eq(auditLogs.targetId, targetId))).orderBy(desc(auditLogs.createdAt)).limit(limit);
  }
}
export const auditLogger = new AuditLogger();
