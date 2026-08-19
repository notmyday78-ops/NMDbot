"use strict";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDatabase } from "../database/connection";
import { userXp, xpMultipliers } from "../database/schema/xp";
import { users } from "../database/schema/users";
import { economyCooldowns } from "../database/schema/economy";
import { logger } from "../utils/logger";
import { configurationService } from "./configurationService";
import { ensureUserExists } from "../utils/userUtils";
import { t } from "../i18n";
export class XPService {
  xpCooldowns = /* @__PURE__ */ new Map();
  voiceStates = /* @__PURE__ */ new Map();
  // Level calculation formula: level = floor(0.1 * sqrt(xp))
  calculateLevel(xp) {
    return Math.floor(0.1 * Math.sqrt(xp));
  }
  // Calculate XP required for a specific level
  calculateXpForLevel(level) {
    return Math.pow(level / 0.1, 2);
  }
  // Check if user is on cooldown
  isOnCooldown(userId, guildId, cooldownSeconds) {
    const key = `${userId}-${guildId}`;
    const now = Date.now();
    const lastGain = this.xpCooldowns.get(key) || 0;
    if (Math.random() < 0.01) {
      for (const [k, v] of this.xpCooldowns.entries()) {
        if (now - v > 3600 * 1e3) {
          this.xpCooldowns.delete(k);
        }
      }
    }
    return now - lastGain < cooldownSeconds * 1e3;
  }
  // Set cooldown for user
  setCooldown(userId, guildId) {
    const key = `${userId}-${guildId}`;
    this.xpCooldowns.set(key, Date.now());
  }
  // Calculate XP with multipliers
  async calculateXpWithMultipliers(baseXp, member, channelId) {
    try {
      const config = await configurationService.getXPConfig(member.guild.id);
      let multiplier = 1;
      if (channelId) {
        if (config.ignoredChannels.includes(channelId)) return 0;
        if (config.noXpChannels.includes(channelId)) return 0;
        if (config.doubleXpChannels.includes(channelId)) multiplier *= 2;
      }
      const memberRoles = member.roles.cache.map((role) => role.id);
      if (memberRoles.some((roleId) => config.ignoredRoles.includes(roleId))) {
        return 0;
      }
      if (config.boosterRole && memberRoles.includes(config.boosterRole)) {
        multiplier *= config.boosterMultiplier / 100;
      }
      for (const roleId of memberRoles) {
        if (config.roleMultipliers[roleId]) {
          multiplier *= config.roleMultipliers[roleId] / 100;
        }
      }
      const dbMultipliers = await getDatabase().select().from(xpMultipliers).where(eq(xpMultipliers.guildId, member.guild.id));
      for (const dbMultiplier of dbMultipliers) {
        if (dbMultiplier.targetType === "role" && memberRoles.includes(dbMultiplier.targetId)) {
          if (config.roleMultipliers[dbMultiplier.targetId]) continue;
          multiplier *= dbMultiplier.multiplier / 100;
        }
        if (dbMultiplier.targetType === "channel" && channelId === dbMultiplier.targetId) {
          multiplier *= dbMultiplier.multiplier / 100;
        }
      }
      const [voteCooldown] = await getDatabase().select().from(economyCooldowns).where(
        and(
          eq(economyCooldowns.userId, member.user.id),
          eq(economyCooldowns.guildId, "global"),
          eq(economyCooldowns.commandType, "vote")
        )
      ).limit(1);
      if (voteCooldown && voteCooldown.lastUsed.getTime() > Date.now() - 24 * 60 * 60 * 1e3) {
        multiplier *= 1.2;
      }
      return Math.floor(baseXp * multiplier);
    } catch (error) {
      logger.error("Failed to calculate XP with multipliers:", error);
      return baseXp;
    }
  }
  // Add XP to user
  async addXP(userId, guildId, member, xpAmount, channelId, isVoiceActivity = false) {
    try {
      const config = await configurationService.getXPConfig(guildId);
      if (!config.enabled) return null;
      if (channelId && this.isOnCooldown(userId, guildId, config.cooldown)) {
        return null;
      }
      const xpToAdd = await this.calculateXpWithMultipliers(xpAmount, member, channelId);
      if (xpToAdd === 0) return null;
      if (channelId) {
        this.setCooldown(userId, guildId);
      }
      await ensureUserExists(member.user);
      const [updated] = await getDatabase().insert(userXp).values({
        userId,
        guildId,
        xp: xpToAdd,
        level: this.calculateLevel(xpToAdd),
        lastXpGain: /* @__PURE__ */ new Date(),
        lastVoiceActivity: isVoiceActivity ? /* @__PURE__ */ new Date() : null
      }).onConflictDoUpdate({
        target: [userXp.userId, userXp.guildId],
        set: {
          xp: sql`${userXp.xp} + ${xpToAdd}`,
          level: sql`CAST(FLOOR(0.1 * SQRT(${userXp.xp} + ${xpToAdd})) AS INTEGER)`,
          lastXpGain: /* @__PURE__ */ new Date(),
          lastVoiceActivity: isVoiceActivity ? /* @__PURE__ */ new Date() : sql`${userXp.lastVoiceActivity}`,
          updatedAt: /* @__PURE__ */ new Date()
        }
      }).returning();
      const newXp = updated.xp;
      const newLevel = updated.level;
      const oldLevel = this.calculateLevel(newXp - xpToAdd);
      const leveledUp = newLevel > oldLevel;
      let rewardRoles = [];
      let rolesToRemove = [];
      if (leveledUp && config.levelUpRewardsEnabled) {
        const roleRewards = await configurationService.getXPRoleRewards(guildId);
        if (config.stackRoleRewards) {
          rewardRoles = roleRewards.filter((reward) => reward.level <= newLevel).map((reward) => reward.roleId);
        } else {
          const applicableRewards = roleRewards.filter((reward) => reward.level <= newLevel);
          if (applicableRewards.length > 0) {
            const highestReward = applicableRewards.reduce(
              (prev, current) => current.level > prev.level ? current : prev
            );
            rewardRoles = [highestReward.roleId];
            rolesToRemove = roleRewards.filter((reward) => reward.level <= newLevel && reward.roleId !== highestReward.roleId).map((reward) => reward.roleId);
          }
        }
      }
      return {
        xpGained: xpToAdd,
        totalXp: newXp,
        oldLevel,
        newLevel,
        leveledUp,
        rewardRoles: rewardRoles.length > 0 ? rewardRoles : void 0,
        rolesToRemove: rolesToRemove.length > 0 ? rolesToRemove : void 0
      };
    } catch (error) {
      logger.error(`Failed to add XP for user ${userId} in guild ${guildId}:`, error);
      return null;
    }
  }
  // Get user rank data
  async getUserRank(userId, guildId) {
    try {
      const [userXpData] = await getDatabase().select({
        userId: userXp.userId,
        guildId: userXp.guildId,
        xp: userXp.xp,
        level: userXp.level,
        username: users.username,
        avatarUrl: users.avatarUrl
      }).from(userXp).leftJoin(users, eq(users.id, userXp.userId)).where(and(eq(userXp.userId, userId), eq(userXp.guildId, guildId))).limit(1);
      if (!userXpData) {
        return null;
      }
      const db3 = getDatabase();
      const [rankResult] = await db3.select({
        rank: sql`COUNT(*) + 1`
      }).from(userXp).where(
        and(
          eq(userXp.guildId, guildId),
          gte(userXp.xp, userXpData.xp),
          sql`${userXp.userId} != ${userId}`
        )
      );
      const rank = rankResult?.rank || 1;
      const currentLevelXp = this.calculateXpForLevel(userXpData.level);
      const nextLevelXp = this.calculateXpForLevel(userXpData.level + 1);
      const progress = (userXpData.xp - currentLevelXp) / (nextLevelXp - currentLevelXp) * 100;
      return {
        userId: userXpData.userId,
        guildId: userXpData.guildId,
        username: userXpData.username || t("common.unknownUser", { defaultValue: "Unknown User" }),
        avatarUrl: userXpData.avatarUrl || void 0,
        xp: userXpData.xp,
        level: userXpData.level,
        rank,
        nextLevelXp,
        currentLevelXp,
        progress: Math.min(100, Math.max(0, progress))
      };
    } catch (error) {
      logger.error(`Failed to get rank for user ${userId} in guild ${guildId}:`, error);
      return null;
    }
  }
  // Get leaderboard
  async getLeaderboard(guildId, page = 1, limit = 10) {
    try {
      const offset = (page - 1) * limit;
      const [countResult] = await getDatabase().select({ count: sql`COUNT(*)` }).from(userXp).where(eq(userXp.guildId, guildId));
      const totalCount = countResult?.count || 0;
      const totalPages = Math.ceil(totalCount / limit);
      const entries = await getDatabase().select({
        userId: userXp.userId,
        xp: userXp.xp,
        level: userXp.level,
        username: users.username,
        avatarUrl: users.avatarUrl
      }).from(userXp).leftJoin(users, eq(users.id, userXp.userId)).where(eq(userXp.guildId, guildId)).orderBy(desc(userXp.xp)).limit(limit).offset(offset);
      const leaderboardEntries = entries.map((entry, index) => ({
        userId: entry.userId,
        username: entry.username || t("common.unknownUser", { defaultValue: "Unknown User" }),
        avatarUrl: entry.avatarUrl || void 0,
        xp: entry.xp,
        level: entry.level,
        rank: offset + index + 1
      }));
      return {
        entries: leaderboardEntries,
        totalPages,
        currentPage: page
      };
    } catch (error) {
      logger.error(`Failed to get leaderboard for guild ${guildId}:`, error);
      return {
        entries: [],
        totalPages: 0,
        currentPage: 1
      };
    }
  }
  // Reset user XP
  async resetUserXP(userId, guildId) {
    try {
      await getDatabase().delete(userXp).where(and(eq(userXp.userId, userId), eq(userXp.guildId, guildId)));
      return true;
    } catch (error) {
      logger.error(`Failed to reset XP for user ${userId} in guild ${guildId}:`, error);
      return false;
    }
  }
  // Get rank card customization
  async getRankCardCustomization(userId) {
    try {
      const [user] = await getDatabase().select({
        rankCardData: users.rankCardData
      }).from(users).where(eq(users.id, userId)).limit(1);
      if (user?.rankCardData) {
        return JSON.parse(user.rankCardData);
      }
      return {
        backgroundColor: "#23272A",
        progressBarColor: "#5865F2",
        textColor: "#FFFFFF",
        accentColor: "#EB459E"
      };
    } catch (error) {
      logger.error(`Failed to get rank card customization for user ${userId}:`, error);
      return {
        backgroundColor: "#23272A",
        progressBarColor: "#5865F2",
        textColor: "#FFFFFF",
        accentColor: "#EB459E"
      };
    }
  }
  // Save rank card customization
  async saveRankCardCustomization(userId, customization) {
    try {
      const [updated] = await getDatabase().update(users).set({
        rankCardData: JSON.stringify(customization),
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq(users.id, userId)).returning();
      if (!updated) {
        await getDatabase().insert(users).values({
          id: userId,
          username: "Unknown",
          discriminator: "0000",
          rankCardData: JSON.stringify(customization)
        }).onConflictDoUpdate({
          target: [users.id],
          set: {
            rankCardData: JSON.stringify(customization),
            updatedAt: /* @__PURE__ */ new Date()
          }
        });
      }
      return true;
    } catch (error) {
      logger.error(`Failed to save rank card customization for user ${userId}:`, error);
      return false;
    }
  }
  // Voice state tracking
  startVoiceTracking(userId, guildId) {
    const key = `${userId}-${guildId}`;
    this.voiceStates.set(key, Date.now());
  }
  async stopVoiceTracking(userId, guildId, member) {
    const key = `${userId}-${guildId}`;
    const startTime = this.voiceStates.get(key);
    if (!startTime) return null;
    this.voiceStates.delete(key);
    const duration = Date.now() - startTime;
    const minutes = Math.floor(duration / 6e4);
    if (minutes < 1) return null;
    const config = await configurationService.getXPConfig(guildId);
    const xpToAdd = minutes * config.perVoiceMinute;
    return this.addXP(userId, guildId, member, xpToAdd, void 0, true);
  }
  // Get all voice states (for cleanup)
  getAllVoiceStates() {
    return this.voiceStates;
  }
}
export const xpService = new XPService();
