"use strict";
import { and, eq } from "drizzle-orm";
import { getDatabase } from "../database/connection";
import { modLogSettings } from "../database/schema";
function mapModLogSetting(record) {
  return {
    id: record.id,
    guildId: record.guildId,
    category: record.category,
    channelId: record.channelId,
    enabled: record.enabled,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}
export class ModLogRepository {
  get db() {
    return getDatabase();
  }
  async getByGuild(guildId) {
    const records = await this.db.select().from(modLogSettings).where(eq(modLogSettings.guildId, guildId));
    return records.map(mapModLogSetting);
  }
  async get(guildId, category) {
    const [record] = await this.db.select().from(modLogSettings).where(and(eq(modLogSettings.guildId, guildId), eq(modLogSettings.category, category))).limit(1);
    return record ? mapModLogSetting(record) : null;
  }
  async upsert(guildId, category, channelId, enabled = true) {
    const [record] = await this.db.insert(modLogSettings).values({
      guildId,
      category,
      channelId,
      enabled
    }).onConflictDoUpdate({
      target: [modLogSettings.guildId, modLogSettings.category],
      set: {
        channelId,
        enabled,
        updatedAt: /* @__PURE__ */ new Date()
      }
    }).returning();
    return mapModLogSetting(record);
  }
  async delete(guildId, category) {
    const [record] = await this.db.delete(modLogSettings).where(and(eq(modLogSettings.guildId, guildId), eq(modLogSettings.category, category))).returning();
    return Boolean(record);
  }
  async setEnabled(guildId, category, enabled) {
    const [record] = await this.db.update(modLogSettings).set({
      enabled,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(and(eq(modLogSettings.guildId, guildId), eq(modLogSettings.category, category))).returning();
    return record ? mapModLogSetting(record) : null;
  }
}
export const modLogRepository = new ModLogRepository();
