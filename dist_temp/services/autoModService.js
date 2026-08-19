"use strict";
import { autoModRepository } from "../repositories/autoModRepository";
import { logger } from "../utils/logger";
import { safeRegexTest } from "../utils/regexUtils";
export class AutoModService {
  async evaluateMessage(message) {
    if (!message.guild || message.author.bot) return false;
    try {
      const rules = await autoModRepository.getRulesByEvent(message.guild.id, "messageCreate");
      if (!rules || rules.length === 0) return false;
      const member = message.member;
      const channelId = message.channel.id;
      for (const rule of rules) {
        if (rule.exemptChannels && rule.exemptChannels.includes(channelId)) continue;
        if (member && rule.exemptRoles && rule.exemptRoles.some((roleId) => member.roles.cache.has(roleId))) {
          continue;
        }
        const isTriggered = this.checkRuleMatch(message, rule);
        if (isTriggered) {
          await this.executeActions(message, rule);
          return true;
        }
      }
    } catch (error) {
      logger.error(`Error evaluating AutoMod for message ${message.id}:`, error);
    }
    return false;
  }
  checkRuleMatch(message, rule) {
    const { triggerType, triggerMetadata } = rule;
    const content = message.content;
    switch (triggerType) {
      case "KEYWORD": {
        const keywords = triggerMetadata?.keywords || [];
        return keywords.some((keyword) => content.toLowerCase().includes(keyword.toLowerCase()));
      }
      case "REGEX": {
        const patterns = triggerMetadata?.regexPatterns || [];
        return patterns.some((pattern) => {
          return safeRegexTest(pattern, "i", content);
        });
      }
      case "MENTION_SPAM": {
        const threshold = triggerMetadata?.mentionTotalLimit || 5;
        return message.mentions.users.size + message.mentions.roles.size >= threshold;
      }
      case "ATTACHMENT_SPAM": {
        const threshold = triggerMetadata?.attachmentLimit || 5;
        return message.attachments.size >= threshold;
      }
      default:
        return false;
    }
  }
  async executeActions(message, rule) {
    const { actions } = rule;
    const guildId = message.guild.id;
    const userId = message.author.id;
    for (const action of actions) {
      switch (action.type) {
        case "DELETE_MESSAGE": {
          try {
            if (message.deletable) {
              await message.delete();
            }
          } catch (error) {
            logger.warn(`AutoMod failed to delete message ${message.id}:`, error);
          }
          break;
        }
        case "WARN_USER": {
          try {
            const reason = action.metadata?.reason || `Triggered AutoMod rule: ${rule.name}`;
            if ("send" in message.channel) {
              await message.channel.send(`\u26A0\uFE0F <@${userId}>, you have received a warning: ${reason}`);
            }
          } catch (error) {
            logger.warn(`AutoMod failed to warn user ${userId}:`, error);
          }
          break;
        }
        case "TIMEOUT_USER": {
          try {
            const duration = action.metadata?.durationSeconds || 60;
            if (message.member && message.member.moderatable) {
              await message.member.timeout(duration * 1e3, `AutoMod rule: ${rule.name}`);
            }
          } catch (error) {
            logger.warn(`AutoMod failed to timeout user ${userId}:`, error);
          }
          break;
        }
        case "ADD_INFRACTION": {
          try {
            const points = action.metadata?.points || 1;
            const expiresHours = action.metadata?.expiresHours || 24;
            const expiresAt = new Date(Date.now() + expiresHours * 3600 * 1e3);
            await autoModRepository.createInfraction({
              guildId,
              userId,
              ruleId: rule.id,
              points,
              actionTaken: action.type,
              reason: `Triggered AutoMod rule: ${rule.name}`,
              expiresAt
            });
            const activeInfractions = await autoModRepository.getActiveInfractions(guildId, userId);
            const totalPoints = activeInfractions.reduce((acc, curr) => acc + curr.points, 0);
            const quarantineThreshold = action.metadata?.quarantineThreshold || 10;
            if (totalPoints >= quarantineThreshold) {
              await this.quarantineUser(
                guildId,
                userId,
                message.member,
                `Exceeded infraction threshold (${totalPoints}/${quarantineThreshold})`,
                "AutoMod"
              );
            }
          } catch (error) {
            logger.error(`AutoMod failed to add infraction for user ${userId}:`, error);
          }
          break;
        }
      }
    }
  }
  async quarantineUser(guildId, userId, member, reason, jailedBy) {
    try {
      const existing = await autoModRepository.getQuarantineStatus(guildId, userId);
      if (existing) return existing;
      let originalRoles = [];
      if (member) {
        originalRoles = member.roles.cache.filter((r) => r.id !== guildId).map((r) => r.id);
        try {
          await member.roles.remove(originalRoles, `Quarantined: ${reason}`);
          const quarantineRole = member.guild.roles.cache.find(
            (r) => r.name.toLowerCase().includes("quarantine") || r.name.toLowerCase().includes("jailed")
          );
          if (quarantineRole) {
            await member.roles.add(quarantineRole, `Quarantined: ${reason}`);
          }
        } catch (error) {
          logger.warn(`Failed to modify roles for quarantined member ${userId}:`, error);
        }
      }
      return await autoModRepository.quarantineUser({
        guildId,
        userId,
        originalRoles,
        reason,
        jailedBy
      });
    } catch (error) {
      logger.error(`Error quarantining user ${userId}:`, error);
      throw error;
    }
  }
  async releaseQuarantine(guildId, userId, member, releasedBy) {
    try {
      const record = await autoModRepository.releaseQuarantine(guildId, userId, releasedBy);
      if (!record) return null;
      if (member) {
        try {
          const quarantineRole = member.guild.roles.cache.find(
            (r) => r.name.toLowerCase().includes("quarantine") || r.name.toLowerCase().includes("jailed")
          );
          if (quarantineRole) {
            await member.roles.remove(quarantineRole, `Released from quarantine by ${releasedBy}`);
          }
          if (record.originalRoles && record.originalRoles.length > 0) {
            await member.roles.add(
              record.originalRoles,
              `Released from quarantine by ${releasedBy}`
            );
          }
        } catch (error) {
          logger.warn(`Failed to restore roles for released member ${userId}:`, error);
        }
      }
      return record;
    } catch (error) {
      logger.error(`Error releasing quarantine for user ${userId}:`, error);
      throw error;
    }
  }
}
export const autoModService = new AutoModService();
