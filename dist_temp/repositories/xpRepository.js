"use strict";
import { and, eq, desc, gte, sql } from "drizzle-orm";
import { getDatabase } from "../database/connection";
import { userXp, xpRewards, xpMultipliers, xpSettings } from "../database/schema/xp";
import { users } from "../database/schema/users";
import { logger } from "../utils/logger";
export class XPRepository {
  // Get user XP data
  async getUserXP(userId, guildId) {
    try {
      const [result] = await getDatabase().select().from(userXp).where(and(eq(userXp.userId, userId), eq(userXp.guildId, guildId))).limit(1);
      return result || null;
    } catch (error) {
      logger.error("Failed to get user XP:", error);
      return null;
    }
  }
  // Create or update user XP
  async upsertUserXP(data) {
    try {
      await getDatabase().insert(userXp).values({
        userId: data.userId,
        guildId: data.guildId,
        xp: data.xp ?? 0,
        level: data.level ?? 0,
        lastXpGain: data.lastXpGain ?? /* @__PURE__ */ new Date(),
        lastVoiceActivity: data.lastVoiceActivity
      }).onConflictDoUpdate({
        target: [userXp.userId, userXp.guildId],
        set: {
          xp: data.xp ?? sql`${userXp.xp}`,
          level: data.level ?? sql`${userXp.level}`,
          lastXpGain: data.lastXpGain ?? sql`${userXp.lastXpGain}`,
          lastVoiceActivity: data.lastVoiceActivity ?? sql`${userXp.lastVoiceActivity}`,
          updatedAt: /* @__PURE__ */ new Date()
        }
      });
      return true;
    } catch (error) {
      logger.error("Failed to upsert user XP:", error);
      return false;
    }
  }
  // Get guild leaderboard
  async getLeaderboard(guildId, limit, offset) {
    try {
      const results = await getDatabase().select({
        userId: userXp.userId,
        guildId: userXp.guildId,
        xp: userXp.xp,
        level: userXp.level,
        lastXpGain: userXp.lastXpGain,
        lastVoiceActivity: userXp.lastVoiceActivity,
        username: users.username,
        avatarUrl: users.avatarUrl
      }).from(userXp).leftJoin(users, eq(users.id, userXp.userId)).where(eq(userXp.guildId, guildId)).orderBy(desc(userXp.xp)).limit(limit).offset(offset);
      return results.map((r) => ({
        ...r,
        username: r.username ?? void 0,
        avatarUrl: r.avatarUrl ?? void 0
      }));
    } catch (error) {
      logger.error("Failed to get leaderboard:", error);
      return [];
    }
  }
  // Get total users with XP in guild
  async getTotalUsersWithXP(guildId) {
    try {
      const [result] = await getDatabase().select({ count: sql`COUNT(*)` }).from(userXp).where(eq(userXp.guildId, guildId));
      return result?.count || 0;
    } catch (error) {
      logger.error("Failed to get total users with XP:", error);
      return 0;
    }
  }
  // Get user rank
  async getUserRank(userId, guildId, userXpAmount) {
    try {
      const [result] = await getDatabase().select({
        rank: sql`COUNT(*) + 1`
      }).from(userXp).where(
        and(
          eq(userXp.guildId, guildId),
          gte(userXp.xp, userXpAmount),
          sql`${userXp.userId} != ${userId}`
        )
      );
      return result?.rank || 1;
    } catch (error) {
      logger.error("Failed to get user rank:", error);
      return 1;
    }
  }
  // Get XP rewards for guild
  async getXPRewards(guildId) {
    try {
      const results = await getDatabase().select().from(xpRewards).where(eq(xpRewards.guildId, guildId)).orderBy(xpRewards.level);
      return results;
    } catch (error) {
      logger.error("Failed to get XP rewards:", error);
      return [];
    }
  }
  // Get XP multipliers for guild
  async getXPMultipliers(guildId) {
    try {
      const results = await getDatabase().select().from(xpMultipliers).where(eq(xpMultipliers.guildId, guildId));
      return results.map((r) => ({
        guildId: r.guildId,
        targetId: r.targetId,
        targetType: r.targetType,
        multiplier: r.multiplier
      }));
    } catch (error) {
      logger.error("Failed to get XP multipliers:", error);
      return [];
    }
  }
  // Get XP settings for guild
  async getXPSettings(guildId) {
    try {
      const [result] = await getDatabase().select().from(xpSettings).where(eq(xpSettings.guildId, guildId)).limit(1);
      if (!result) return null;
      return {
        guildId: result.guildId,
        ignoredChannels: JSON.parse(result.ignoredChannels),
        ignoredRoles: JSON.parse(result.ignoredRoles),
        noXpChannels: JSON.parse(result.noXpChannels),
        doubleXpChannels: JSON.parse(result.doubleXpChannels),
        roleMultipliers: JSON.parse(result.roleMultipliers),
        levelUpRewardsEnabled: result.levelUpRewardsEnabled,
        stackRoleRewards: result.stackRoleRewards
      };
    } catch (error) {
      logger.error("Failed to get XP settings:", error);
      return null;
    }
  }
  // Delete user XP
  async deleteUserXP(userId, guildId) {
    try {
      await getDatabase().delete(userXp).where(and(eq(userXp.userId, userId), eq(userXp.guildId, guildId)));
      return true;
    } catch (error) {
      logger.error("Failed to delete user XP:", error);
      return false;
    }
  }
}
export const xpRepository = new XPRepository();
