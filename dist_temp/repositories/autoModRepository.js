"use strict";
import { and, eq } from "drizzle-orm";
import { BaseRepository } from "./baseRepository";
import { autoModRules, autoModInfractions, quarantineVault } from "../database/schema/automod";
export class AutoModRepository extends BaseRepository {
  rulesCache = /* @__PURE__ */ new Map();
  CACHE_TTL = 60 * 1e3;
  // 1 minute cache TTL
  async getRulesByEvent(guildId, eventType) {
    const cacheKey = `${guildId}:${eventType}`;
    const cached = this.rulesCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.rules;
    }
    return this.executeQuery("getRulesByEvent", async () => {
      const records = await this.db.select().from(autoModRules).where(
        and(
          eq(autoModRules.guildId, guildId),
          eq(autoModRules.eventType, eventType),
          eq(autoModRules.enabled, true)
        )
      );
      const rules = records;
      this.rulesCache.set(cacheKey, { rules, expiresAt: Date.now() + this.CACHE_TTL });
      return rules;
    });
  }
  async listRules(guildId) {
    return this.executeQuery("listRules", async () => {
      const records = await this.db.select().from(autoModRules).where(eq(autoModRules.guildId, guildId));
      return records;
    });
  }
  async createRule(data) {
    return this.executeQuery("createRule", async () => {
      const [record] = await this.db.insert(autoModRules).values({
        guildId: data.guildId,
        name: data.name,
        description: data.description,
        eventType: data.eventType,
        triggerType: data.triggerType,
        triggerMetadata: data.triggerMetadata ?? {},
        conditions: data.conditions ?? {},
        exemptRoles: data.exemptRoles ?? [],
        exemptChannels: data.exemptChannels ?? [],
        actions: data.actions ?? [],
        enabled: data.enabled ?? true,
        createdBy: data.createdBy
      }).returning();
      const rule = record;
      this.rulesCache.delete(`${data.guildId}:${data.eventType}`);
      return rule;
    });
  }
  async updateRule(id, guildId, updates) {
    return this.executeQuery("updateRule", async () => {
      const [record] = await this.db.update(autoModRules).set({
        ...updates,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(and(eq(autoModRules.id, id), eq(autoModRules.guildId, guildId))).returning();
      const rule = record || null;
      if (rule) {
        this.rulesCache.delete(`${guildId}:${rule.eventType}`);
      }
      return rule;
    });
  }
  async deleteRule(id, guildId) {
    return this.executeQuery("deleteRule", async () => {
      const [record] = await this.db.delete(autoModRules).where(and(eq(autoModRules.id, id), eq(autoModRules.guildId, guildId))).returning();
      const rule = record;
      if (rule) {
        this.rulesCache.delete(`${guildId}:${rule.eventType}`);
      }
      return Boolean(record);
    });
  }
  async createInfraction(data) {
    return this.executeQuery("createInfraction", async () => {
      const [record] = await this.db.insert(autoModInfractions).values({
        guildId: data.guildId,
        userId: data.userId,
        ruleId: data.ruleId,
        points: data.points ?? 1,
        actionTaken: data.actionTaken,
        reason: data.reason,
        expiresAt: data.expiresAt
      }).returning();
      return record;
    });
  }
  async getActiveInfractions(guildId, userId) {
    return this.executeQuery("getActiveInfractions", async () => {
      const records = await this.db.select().from(autoModInfractions).where(
        and(
          eq(autoModInfractions.guildId, guildId),
          eq(autoModInfractions.userId, userId),
          eq(autoModInfractions.active, true)
        )
      );
      const now = /* @__PURE__ */ new Date();
      return records.filter((r) => new Date(r.expiresAt) > now);
    });
  }
  async getQuarantineStatus(guildId, userId) {
    return this.executeQuery("getQuarantineStatus", async () => {
      const [record] = await this.db.select().from(quarantineVault).where(
        and(
          eq(quarantineVault.guildId, guildId),
          eq(quarantineVault.userId, userId),
          eq(quarantineVault.released, false)
        )
      ).limit(1);
      return record || null;
    });
  }
  async quarantineUser(data) {
    return this.executeQuery("quarantineUser", async () => {
      const [record] = await this.db.insert(quarantineVault).values({
        guildId: data.guildId,
        userId: data.userId,
        originalRoles: data.originalRoles,
        reason: data.reason,
        jailedBy: data.jailedBy
      }).returning();
      return record;
    });
  }
  async releaseQuarantine(guildId, userId, releasedBy) {
    return this.executeQuery("releaseQuarantine", async () => {
      const [record] = await this.db.update(quarantineVault).set({
        released: true,
        releasedBy,
        releasedAt: /* @__PURE__ */ new Date()
      }).where(
        and(
          eq(quarantineVault.guildId, guildId),
          eq(quarantineVault.userId, userId),
          eq(quarantineVault.released, false)
        )
      ).returning();
      return record || null;
    });
  }
  async listQuarantinedUsers(guildId) {
    return this.executeQuery("listQuarantinedUsers", async () => {
      const records = await this.db.select().from(quarantineVault).where(and(eq(quarantineVault.guildId, guildId), eq(quarantineVault.released, false)));
      return records;
    });
  }
}
export const autoModRepository = new AutoModRepository();
