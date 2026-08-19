"use strict";
import { eq } from "drizzle-orm";
import { getDatabase } from "../database/connection";
import { guilds, guildSettings } from "../database/schema";
export class GuildRepository {
  get db() {
    return getDatabase();
  }
  async findById(id) {
    const result = await this.db.select().from(guilds).where(eq(guilds.id, id)).limit(1);
    if (!result[0]) return null;
    return {
      ...result[0],
      prefix: result[0].prefix ?? void 0,
      language: result[0].language ?? void 0
    };
  }
  async create(guildId) {
    const [guild] = await this.db.insert(guilds).values({ id: guildId }).returning();
    return {
      ...guild,
      prefix: guild.prefix ?? void 0,
      language: guild.language ?? void 0
    };
  }
  async update(guildId, data) {
    const [updated] = await this.db.update(guilds).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(guilds.id, guildId)).returning();
    if (!updated) return null;
    return {
      ...updated,
      prefix: updated.prefix ?? void 0,
      language: updated.language ?? void 0
    };
  }
  async delete(guildId) {
    const result = await this.db.delete(guilds).where(eq(guilds.id, guildId));
    return result.count > 0;
  }
  async getSettings(guildId) {
    const result = await this.db.select().from(guildSettings).where(eq(guildSettings.guildId, guildId)).limit(1);
    if (!result[0]) return null;
    const settings = result[0];
    return {
      ...settings,
      welcomeChannel: settings.welcomeChannel ?? void 0,
      welcomeMessage: settings.welcomeMessage ?? void 0,
      goodbyeChannel: settings.goodbyeChannel ?? void 0,
      goodbyeMessage: settings.goodbyeMessage ?? void 0,
      logsChannel: settings.logsChannel ?? void 0,
      levelUpMessage: settings.levelUpMessage ?? void 0,
      levelUpChannel: settings.levelUpChannel ?? void 0,
      honeypotChannelId: settings.honeypotChannelId ?? void 0,
      stickies: settings.stickies ? JSON.parse(settings.stickies) : void 0
    };
  }
  async updateSettings(guildId, settings) {
    const dbSettings = {
      ...settings,
      stickies: settings.stickies ? JSON.stringify(settings.stickies) : void 0
    };
    const [updated] = await this.db.insert(guildSettings).values({ guildId, ...dbSettings }).onConflictDoUpdate({
      target: guildSettings.guildId,
      set: { ...dbSettings, updatedAt: /* @__PURE__ */ new Date() }
    }).returning();
    return {
      ...updated,
      welcomeChannel: updated.welcomeChannel ?? void 0,
      welcomeMessage: updated.welcomeMessage ?? void 0,
      goodbyeChannel: updated.goodbyeChannel ?? void 0,
      goodbyeMessage: updated.goodbyeMessage ?? void 0,
      logsChannel: updated.logsChannel ?? void 0,
      levelUpMessage: updated.levelUpMessage ?? void 0,
      levelUpChannel: updated.levelUpChannel ?? void 0,
      honeypotChannelId: updated.honeypotChannelId ?? void 0,
      stickies: updated.stickies ? JSON.parse(updated.stickies) : void 0
    };
  }
}
export const guildRepository = new GuildRepository();
