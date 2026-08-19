"use strict";
import { and, desc, eq, gt, isNotNull, or } from "drizzle-orm";
import { getDatabase } from "../database/connection";
import { modCases } from "../database/schema";
export class ModCaseRepository {
  get db() {
    return getDatabase();
  }
  mapCase(record) {
    return {
      id: record.id,
      guildId: record.guildId,
      userId: record.userId,
      moderatorId: record.moderatorId,
      type: record.type,
      reason: record.reason ?? void 0,
      duration: record.duration ?? void 0,
      expiresAt: record.expiresAt ?? void 0,
      createdAt: record.createdAt
    };
  }
  async create(data) {
    const [created] = await this.db.insert(modCases).values({
      guildId: data.guildId,
      userId: data.userId,
      moderatorId: data.moderatorId,
      type: data.type,
      reason: data.reason,
      duration: data.duration ?? null,
      expiresAt: data.expiresAt ?? null
    }).returning();
    return this.mapCase(created);
  }
  async getById(guildId, caseId) {
    const [record] = await this.db.select().from(modCases).where(and(eq(modCases.guildId, guildId), eq(modCases.id, caseId))).limit(1);
    return record ? this.mapCase(record) : null;
  }
  async delete(guildId, caseId) {
    const [deleted] = await this.db.delete(modCases).where(and(eq(modCases.guildId, guildId), eq(modCases.id, caseId))).returning();
    return Boolean(deleted);
  }
  async getByUser(guildId, userId, limit = 10) {
    const results = await this.db.select().from(modCases).where(and(eq(modCases.guildId, guildId), eq(modCases.userId, userId))).orderBy(desc(modCases.createdAt)).limit(limit);
    return results.map((record) => this.mapCase(record));
  }
  async getByUserOrModerator(guildId, userId, limit = 10) {
    const results = await this.db.select().from(modCases).where(
      and(
        eq(modCases.guildId, guildId),
        or(eq(modCases.userId, userId), eq(modCases.moderatorId, userId))
      )
    ).orderBy(desc(modCases.createdAt)).limit(limit);
    return results.map((record) => this.mapCase(record));
  }
  async getRecent(guildId, limit = 10) {
    const results = await this.db.select().from(modCases).where(eq(modCases.guildId, guildId)).orderBy(desc(modCases.createdAt)).limit(limit);
    return results.map((record) => this.mapCase(record));
  }
  async getActiveTempActions() {
    const results = await this.db.select().from(modCases).where(
      and(
        or(eq(modCases.type, "ban"), eq(modCases.type, "mute")),
        isNotNull(modCases.expiresAt),
        gt(modCases.expiresAt, /* @__PURE__ */ new Date())
      )
    );
    return results.map((record) => this.mapCase(record));
  }
  async markTempActionCompleted(caseId) {
    await this.db.update(modCases).set({
      duration: null,
      expiresAt: null
    }).where(eq(modCases.id, caseId));
  }
}
export const modCaseRepository = new ModCaseRepository();
