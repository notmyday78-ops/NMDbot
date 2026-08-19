"use strict";
import { engagementRepository } from "../repositories/engagementRepository";
import { economyRepository } from "../repositories/economyRepository";
import { xpService } from "./xpService";
import { logger } from "../utils/logger";
import { guildService } from "./guildService";
export class EngagementService {
  async trackMessageActivity(message) {
    if (!message.guild || message.author.bot) return;
    const guildId = message.guild.id;
    const userId = message.author.id;
    const member = message.member;
    try {
      const activeQuests = await engagementRepository.getActiveQuests(guildId);
      for (const quest of activeQuests) {
        if (quest.targetType === "messages_sent") {
          if (quest.requirementChannelId && message.channel.id !== quest.requirementChannelId) {
            continue;
          }
          await this.progressQuest(
            guildId,
            userId,
            member,
            quest,
            1,
            message.channel
          );
        }
      }
      if (member) {
        const totalMessages = await engagementRepository.incrementMemberMetric(
          guildId,
          userId,
          "messages",
          1
        );
        await this.checkAchievements(
          guildId,
          userId,
          member,
          "messages_sent",
          totalMessages,
          message.channel
        );
      }
    } catch (error) {
      logger.error(`Error tracking message activity for user ${userId}:`, error);
    }
  }
  async trackVoiceActivity(userId, guildId, member, minutes) {
    if (!member || member.user.bot || minutes <= 0) return;
    try {
      const activeQuests = await engagementRepository.getActiveQuests(guildId);
      for (const quest of activeQuests) {
        if (quest.targetType === "voice_minutes") {
          await this.progressQuest(guildId, userId, member, quest, minutes);
        }
      }
      const totalVoiceMinutes = await engagementRepository.incrementMemberMetric(
        guildId,
        userId,
        "voiceMinutes",
        minutes
      );
      await this.checkAchievements(guildId, userId, member, "voice_minutes", totalVoiceMinutes);
    } catch (error) {
      logger.error(`Error tracking voice activity for user ${userId}:`, error);
    }
  }
  async progressQuest(guildId, userId, member, quest, amount, channel) {
    try {
      const progressObj = await engagementRepository.getUserQuestProgress(
        guildId,
        userId,
        quest.id
      );
      if (progressObj?.completed) return;
      const newProgress = (progressObj?.progress || 0) + amount;
      const completed = newProgress >= quest.targetValue;
      await engagementRepository.updateUserQuestProgress(
        guildId,
        userId,
        quest.id,
        newProgress,
        completed
      );
      if (completed && member) {
        if (quest.rewardCoins > 0) {
          await economyRepository.addToBalance(userId, guildId, quest.rewardCoins);
        }
        if (quest.rewardXp > 0) {
          await xpService.addXP(userId, guildId, member, quest.rewardXp);
        }
        const notifyChannel = quest.channelId ? channel?.guild?.channels.cache.get(quest.channelId) : channel;
        if (notifyChannel) {
          await notifyChannel.send(
            `\u{1F389} <@${userId}> has completed the quest **${quest.title}**! Earned ${quest.rewardXp} XP and ${quest.rewardCoins} coins.`
          );
        }
      }
    } catch (error) {
      logger.error(`Error progressing quest ${quest.questId} for user ${userId}:`, error);
    }
  }
  async checkAchievements(guildId, userId, member, metricType, incrementValue, channel) {
    try {
      const achievements = await engagementRepository.listAchievements(guildId);
      const userUnlocked = await engagementRepository.getUserAchievements(guildId, userId);
      const unlockedIds = new Set(userUnlocked.map((a) => a.achievementId));
      const guildSettings = await guildService.getGuildSettings(guildId);
      for (const achievement of achievements) {
        if (unlockedIds.has(achievement.id)) continue;
        if (achievement.requirementChannelId && channel && channel.id !== achievement.requirementChannelId) {
          continue;
        }
        if (achievement.requirementType === metricType) {
          let currentMetric = incrementValue;
          if (metricType === "reputation") {
            const reps = await engagementRepository.getUserReputation(guildId, userId);
            currentMetric = reps.length;
          } else if (metricType === "messages_sent" || metricType === "voice_minutes") {
            currentMetric = incrementValue;
          }
          if (currentMetric >= achievement.requirementValue) {
            await engagementRepository.unlockAchievement(guildId, userId, achievement.id);
            if (achievement.rewardCoins > 0) {
              await economyRepository.addToBalance(userId, guildId, achievement.rewardCoins);
            }
            if (achievement.rewardXp > 0) {
              await xpService.addXP(userId, guildId, member, achievement.rewardXp);
            }
            let notifyChannel = channel;
            if (achievement.channelId) {
              notifyChannel = channel?.guild?.channels.cache.get(achievement.channelId);
            } else if (guildSettings.achievementsChannel) {
              notifyChannel = channel?.guild?.channels.cache.get(
                guildSettings.achievementsChannel
              );
            }
            if (notifyChannel) {
              await notifyChannel.send(
                `\u{1F3C6} <@${userId}> unlocked the achievement **${achievement.title}**! (${achievement.description})`
              );
            }
          }
        }
      }
    } catch (error) {
      logger.error(`Error checking achievements for user ${userId}:`, error);
    }
  }
  async giveThanks(guildId, userId, senderId, member, reason, channel) {
    const rep = await engagementRepository.addReputation(guildId, userId, senderId, reason);
    await this.checkAchievements(guildId, userId, member, "reputation", 1, channel);
    return rep;
  }
  async prestigeUser(userId, guildId, _member) {
    const userXpData = await engagementRepository.getUserPrestige(userId, guildId);
    if (!userXpData) {
      return { success: false, newPrestige: 0, message: "You do not have any XP yet." };
    }
    const requiredLevel = 50;
    if (userXpData.level < requiredLevel) {
      return {
        success: false,
        newPrestige: userXpData.prestigeLevel,
        message: `You must reach level ${requiredLevel} to prestige. Current level: ${userXpData.level}.`
      };
    }
    const newPrestige = userXpData.prestigeLevel + 1;
    await engagementRepository.updateUserPrestige(userId, guildId, newPrestige, 0, 0);
    return {
      success: true,
      newPrestige,
      message: `\u{1F389} Congratulations! You have reached Prestige Level ${newPrestige}! Your XP has been reset to 0.`
    };
  }
}
export const engagementService = new EngagementService();
