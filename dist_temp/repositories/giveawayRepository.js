"use strict";
import { eq, and, sql, lt, isNotNull } from "drizzle-orm";
import { getDatabase } from "../database/connection";
import { giveaways, giveawayEntries } from "../database/schema/giveaways";
export class GiveawayRepository {
  get db() {
    return getDatabase();
  }
  async createGiveaway(data) {
    const [giveaway] = await this.db.insert(giveaways).values({
      ...data,
      requirements: data.requirements,
      // Already handled by Drizzle json() type
      bonusEntries: data.bonusEntries,
      // Already handled by Drizzle json() type
      status: data.status || "active",
      startTime: data.startTime,
      entries: 0
    }).returning();
    return giveaway;
  }
  async getGiveaway(giveawayId) {
    const [giveaway] = await this.db.select().from(giveaways).where(eq(giveaways.giveawayId, giveawayId)).limit(1);
    return giveaway;
  }
  async updateGiveaway(giveawayId, updates) {
    const [updated] = await this.db.update(giveaways).set({
      ...updates,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq(giveaways.giveawayId, giveawayId)).returning();
    return updated;
  }
  async addEntry(giveawayId, userId, entryCount) {
    const [existing] = await this.db.select().from(giveawayEntries).where(and(eq(giveawayEntries.giveawayId, giveawayId), eq(giveawayEntries.userId, userId))).limit(1);
    if (existing) {
      await this.db.update(giveawayEntries).set({
        entries: entryCount,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(and(eq(giveawayEntries.giveawayId, giveawayId), eq(giveawayEntries.userId, userId)));
    } else {
      await this.db.insert(giveawayEntries).values({
        giveawayId,
        userId,
        entries: entryCount
      });
      await this.db.update(giveaways).set({
        entries: sql`${giveaways.entries} + 1`
      }).where(eq(giveaways.giveawayId, giveawayId));
    }
  }
  async removeEntry(giveawayId, userId) {
    const deleted = await this.db.delete(giveawayEntries).where(and(eq(giveawayEntries.giveawayId, giveawayId), eq(giveawayEntries.userId, userId))).returning();
    if (deleted.length > 0) {
      await this.db.update(giveaways).set({
        entries: sql`GREATEST(${giveaways.entries} - 1, 0)`
      }).where(eq(giveaways.giveawayId, giveawayId));
    }
  }
  async getEntries(giveawayId) {
    return this.db.select().from(giveawayEntries).where(eq(giveawayEntries.giveawayId, giveawayId));
  }
  async getUserEntry(giveawayId, userId) {
    const [entry] = await this.db.select().from(giveawayEntries).where(and(eq(giveawayEntries.giveawayId, giveawayId), eq(giveawayEntries.userId, userId))).limit(1);
    return entry;
  }
  async getActiveGiveaways() {
    const db = getDatabase();
    return db.select().from(giveaways).where(eq(giveaways.status, "active"));
  }
  async getGuildGiveaways(guildId, status) {
    const conditions = [eq(giveaways.guildId, guildId)];
    if (status) {
      conditions.push(eq(giveaways.status, status));
    }
    const db = getDatabase();
    return db.select().from(giveaways).where(and(...conditions)).orderBy(giveaways.createdAt);
  }
  async getExpiredGiveaways() {
    const db = getDatabase();
    return db.select().from(giveaways).where(and(eq(giveaways.status, "active"), lt(giveaways.endTime, /* @__PURE__ */ new Date())));
  }
  async getScheduledGiveaways() {
    const db = getDatabase();
    return db.select().from(giveaways).where(and(eq(giveaways.status, "scheduled"), lt(giveaways.startTime, /* @__PURE__ */ new Date())));
  }
  async getEndedGiveawaysPendingAnnouncement() {
    return this.db.select().from(giveaways).where(
      and(
        eq(giveaways.status, "ended"),
        eq(giveaways.announcementSent, false),
        isNotNull(giveaways.winners)
      )
    );
  }
  async getUserGiveawayStats(userId) {
    const entries = await this.db.select({
      totalEntries: sql`count(*)::int`,
      totalWins: sql`count(case when ${giveaways.winners}::jsonb ? ${userId} then 1 end)::int`
    }).from(giveawayEntries).leftJoin(giveaways, eq(giveawayEntries.giveawayId, giveaways.giveawayId)).where(eq(giveawayEntries.userId, userId));
    return {
      totalEntries: entries[0]?.totalEntries || 0,
      totalWins: entries[0]?.totalWins || 0
    };
  }
}
export const giveawayRepository = new GiveawayRepository();
