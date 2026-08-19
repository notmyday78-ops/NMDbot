"use strict";
import { and, eq, desc, sql } from "drizzle-orm";
import { BaseRepository } from "./baseRepository";
import {
  achievements,
  userAchievements,
  engagementQuests,
  userQuestProgress,
  userReputation
} from "../database/schema/engagement";
import { userXp } from "../database/schema/xp";
import { members } from "../database/schema/members";
export class EngagementRepository extends BaseRepository {
  async getAchievement(guildId, achievementId) {
    return this.executeQuery("getAchievement", async () => {
      const [record] = await this.db.select().from(achievements).where(
        and(eq(achievements.guildId, guildId), eq(achievements.achievementId, achievementId))
      ).limit(1);
      return record || null;
    });
  }
  async listAchievements(guildId) {
    return this.executeQuery("listAchievements", async () => {
      const records = await this.db.select().from(achievements).where(eq(achievements.guildId, guildId));
      return records;
    });
  }
  async createAchievement(data) {
    return this.executeQuery("createAchievement", async () => {
      const [record] = await this.db.insert(achievements).values({
        guildId: data.guildId,
        achievementId: data.achievementId,
        title: data.title,
        description: data.description,
        requirementType: data.requirementType,
        requirementValue: data.requirementValue,
        rewardXp: data.rewardXp ?? 0,
        rewardCoins: data.rewardCoins ?? 0,
        customIcon: data.customIcon
      }).returning();
      return record;
    });
  }
  async getUserAchievements(guildId, userId) {
    return this.executeQuery("getUserAchievements", async () => {
      const records = await this.db.select().from(userAchievements).where(and(eq(userAchievements.guildId, guildId), eq(userAchievements.userId, userId)));
      return records;
    });
  }
  async unlockAchievement(guildId, userId, achievementDbId) {
    return this.executeQuery("unlockAchievement", async () => {
      const [record] = await this.db.insert(userAchievements).values({
        guildId,
        userId,
        achievementId: achievementDbId,
        unlockedAt: /* @__PURE__ */ new Date()
      }).onConflictDoNothing().returning();
      return record;
    });
  }
  async getActiveQuests(guildId) {
    return this.executeQuery("getActiveQuests", async () => {
      const records = await this.db.select().from(engagementQuests).where(eq(engagementQuests.guildId, guildId));
      const now = /* @__PURE__ */ new Date();
      return records.filter((r) => new Date(r.activeUntil) > now);
    });
  }
  async createQuest(data) {
    return this.executeQuery("createQuest", async () => {
      const [record] = await this.db.insert(engagementQuests).values({
        guildId: data.guildId,
        questId: data.questId,
        title: data.title,
        description: data.description,
        type: data.type,
        targetType: data.targetType,
        targetValue: data.targetValue,
        rewardXp: data.rewardXp ?? 0,
        rewardCoins: data.rewardCoins ?? 0,
        activeUntil: data.activeUntil
      }).returning();
      return record;
    });
  }
  async getUserQuestProgress(guildId, userId, questDbId) {
    return this.executeQuery("getUserQuestProgress", async () => {
      const [record] = await this.db.select().from(userQuestProgress).where(
        and(
          eq(userQuestProgress.guildId, guildId),
          eq(userQuestProgress.userId, userId),
          eq(userQuestProgress.questId, questDbId)
        )
      ).limit(1);
      return record || null;
    });
  }
  async updateUserQuestProgress(guildId, userId, questDbId, progress, completed) {
    return this.executeQuery("updateUserQuestProgress", async () => {
      const [record] = await this.db.insert(userQuestProgress).values({
        guildId,
        userId,
        questId: questDbId,
        progress,
        completed,
        completedAt: completed ? /* @__PURE__ */ new Date() : null,
        lastUpdated: /* @__PURE__ */ new Date()
      }).onConflictDoUpdate({
        target: [userQuestProgress.guildId, userQuestProgress.userId, userQuestProgress.questId],
        set: {
          progress,
          completed,
          completedAt: completed ? /* @__PURE__ */ new Date() : sql`${userQuestProgress.completedAt}`,
          lastUpdated: /* @__PURE__ */ new Date()
        }
      }).returning();
      return record;
    });
  }
  async addReputation(guildId, userId, senderId, reason) {
    return this.executeQuery("addReputation", async () => {
      const [record] = await this.db.insert(userReputation).values({
        guildId,
        userId,
        senderId,
        reason
      }).returning();
      return record;
    });
  }
  async getUserReputation(guildId, userId) {
    return this.executeQuery("getUserReputation", async () => {
      const records = await this.db.select().from(userReputation).where(and(eq(userReputation.guildId, guildId), eq(userReputation.userId, userId))).orderBy(desc(userReputation.createdAt));
      return records;
    });
  }
  async getUserPrestige(userId, guildId) {
    return this.executeQuery("getUserPrestige", async () => {
      const [record] = await this.db.select().from(userXp).where(and(eq(userXp.userId, userId), eq(userXp.guildId, guildId))).limit(1);
      return record || null;
    });
  }
  async updateUserPrestige(userId, guildId, prestigeLevel, newXp, newLevel) {
    return this.executeQuery("updateUserPrestige", async () => {
      await this.db.insert(userXp).values({
        userId,
        guildId,
        xp: newXp,
        level: newLevel,
        prestigeLevel,
        lastXpGain: /* @__PURE__ */ new Date()
      }).onConflictDoUpdate({
        target: [userXp.userId, userXp.guildId],
        set: {
          xp: newXp,
          level: newLevel,
          prestigeLevel,
          updatedAt: /* @__PURE__ */ new Date()
        }
      });
      return true;
    });
  }
  async incrementMemberMetric(guildId, userId, metric, amount) {
    return this.executeQuery("incrementMemberMetric", async () => {
      const field = metric === "messages" ? members.messages : members.voiceMinutes;
      const [record] = await this.db.insert(members).values({
        guildId,
        userId,
        joinedAt: /* @__PURE__ */ new Date(),
        [metric]: amount
      }).onConflictDoUpdate({
        target: [members.userId, members.guildId],
        set: {
          [metric]: sql`${field} + ${amount}`,
          updatedAt: /* @__PURE__ */ new Date()
        }
      }).returning();
      return record[metric];
    });
  }
  async getMemberMetric(guildId, userId, metric) {
    return this.executeQuery("getMemberMetric", async () => {
      const [record] = await this.db.select().from(members).where(and(eq(members.guildId, guildId), eq(members.userId, userId))).limit(1);
      if (!record) return 0;
      return record[metric] || 0;
    });
  }
}
export const engagementRepository = new EngagementRepository();
