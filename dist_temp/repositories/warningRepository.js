"use strict";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import { getDatabase } from "../database/connection";
import { warnings, warningAutomations } from "../database/schema";
import { generateId } from "../utils/id";
export class WarningRepository {
  get db() {
    return getDatabase();
  }
  async createWarning(data) {
    const warnId = `W${generateId(10)}`;
    const [warning] = await this.db.insert(warnings).values({
      warnId,
      guildId: data.guildId,
      userId: data.userId,
      moderatorId: data.moderatorId,
      title: data.title,
      description: data.description ?? null,
      level: data.level || 1,
      proof: data.proof ?? null
    }).returning();
    return warning;
  }
  async updateWarning(warnId, data) {
    const updatePayload = { editedAt: /* @__PURE__ */ new Date() };
    if (data.title !== void 0) updatePayload.title = data.title;
    if (data.description !== void 0) updatePayload.description = data.description ?? null;
    if (data.editedBy !== void 0) updatePayload.editedBy = data.editedBy;
    const [updated] = await this.db.update(warnings).set(updatePayload).where(eq(warnings.warnId, warnId)).returning();
    return updated;
  }
  async deactivateWarning(warnId, editedBy) {
    const [updated] = await this.db.update(warnings).set({
      active: false,
      editedAt: /* @__PURE__ */ new Date(),
      editedBy
    }).where(eq(warnings.warnId, warnId)).returning();
    return updated;
  }
  async getWarningById(warnId) {
    const [warning] = await this.db.select().from(warnings).where(eq(warnings.warnId, warnId)).limit(1);
    return warning;
  }
  async getUserWarnings(guildId, userId) {
    return this.db.select().from(warnings).where(
      and(eq(warnings.guildId, guildId), eq(warnings.userId, userId), eq(warnings.active, true))
    ).orderBy(desc(warnings.createdAt));
  }
  async getUserWarningStats(guildId, userId) {
    const activeWarnings = await this.db.select({
      count: sql`count(*)::int`,
      totalLevel: sql`COALESCE(sum(${warnings.level}), 0)::int`
    }).from(warnings).where(
      and(eq(warnings.guildId, guildId), eq(warnings.userId, userId), eq(warnings.active, true))
    );
    return {
      count: activeWarnings[0]?.count || 0,
      totalLevel: activeWarnings[0]?.totalLevel || 0
    };
  }
  async createAutomation(data) {
    const automationId = `AUTO${generateId(8)}`;
    const [automation] = await this.db.insert(warningAutomations).values({
      automationId,
      guildId: data.guildId,
      name: data.name,
      description: data.description ?? null,
      triggerType: data.triggerType,
      triggerValue: data.triggerValue,
      actions: data.actions,
      createdBy: data.createdBy,
      notifyChannelId: data.notifyChannelId ?? null,
      notifyMessage: data.notifyMessage ?? null
    }).returning();
    return automation;
  }
  async getGuildAutomations(guildId) {
    return this.db.select().from(warningAutomations).where(eq(warningAutomations.guildId, guildId)).orderBy(desc(warningAutomations.createdAt));
  }
  async deleteAutomation(automationId) {
    const [deleted] = await this.db.delete(warningAutomations).where(eq(warningAutomations.automationId, automationId)).returning();
    return deleted;
  }
  async getActiveAutomations(guildId) {
    return this.db.select().from(warningAutomations).where(and(eq(warningAutomations.guildId, guildId), eq(warningAutomations.enabled, true)));
  }
  async updateAutomationLastTriggered(automationId) {
    await this.db.update(warningAutomations).set({ lastTriggeredAt: /* @__PURE__ */ new Date() }).where(eq(warningAutomations.automationId, automationId));
  }
  async getRecentWarnings(guildId, userId, hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1e3);
    return this.db.select().from(warnings).where(
      and(
        eq(warnings.guildId, guildId),
        eq(warnings.userId, userId),
        eq(warnings.active, true),
        gte(warnings.createdAt, since)
      )
    );
  }
  async purgeWarnings(guildId, userId, moderatorId) {
    const updated = await this.db.update(warnings).set({
      active: false,
      editedAt: /* @__PURE__ */ new Date(),
      editedBy: moderatorId
    }).where(
      and(eq(warnings.guildId, guildId), eq(warnings.userId, userId), eq(warnings.active, true))
    ).returning({ warnId: warnings.warnId });
    return {
      count: updated.length
    };
  }
}
export const warningRepository = new WarningRepository();
