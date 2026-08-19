"use strict";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChannelType
} from "discord.js";
import { warningRepository } from "../repositories/warningRepository";
import { auditLogger } from "../security/audit";
import { t } from "../i18n";
import { ensureUserAndGuildExist } from "../utils/userUtils";
import { logger } from "../utils/logger";
const formatAutomationDuration = (minutes) => {
  if (!minutes || Number.isNaN(minutes)) {
    return "N/A";
  }
  if (minutes % (60 * 24 * 7) === 0) {
    const weeks = minutes / (60 * 24 * 7);
    return `${weeks}w`;
  }
  if (minutes % (60 * 24) === 0) {
    const days = minutes / (60 * 24);
    return `${days}d`;
  }
  if (minutes % 60 === 0) {
    return `${minutes / 60}h`;
  }
  return `${minutes}m`;
};
export class WarningService {
  async createWarning(guild, user, moderator, title, description, level = 1, proof) {
    if (!guild || !user || !moderator) {
      throw new Error("Invalid parameters: guild, user, and moderator are required");
    }
    await ensureUserAndGuildExist(user, guild);
    await ensureUserAndGuildExist(moderator, guild);
    const warning = await warningRepository.createWarning({
      guildId: guild.id,
      userId: user.id,
      moderatorId: moderator.id,
      title,
      description,
      level,
      proof
    });
    await auditLogger.logAction({
      action: "WARN_CREATE",
      userId: moderator.id,
      guildId: guild.id,
      targetId: user.id,
      details: {
        warnId: warning.warnId,
        title,
        level
      }
    });
    await this.checkAutomations(guild, user);
    return warning;
  }
  async editWarning(warnId, title, description, editedBy) {
    const warning = await warningRepository.getWarningById(warnId);
    if (!warning) {
      throw new Error(
        t("commands.warn.subcommands.edit.notFound", { defaultValue: "Warning not found" })
      );
    }
    const updated = await warningRepository.updateWarning(warnId, {
      title,
      description: description || void 0,
      editedBy: editedBy.id
    });
    await auditLogger.logAction({
      action: "WARN_EDIT",
      userId: editedBy.id,
      guildId: warning.guildId,
      targetId: warning.userId,
      details: {
        warnId,
        oldTitle: warning.title,
        newTitle: title
      }
    });
    return updated;
  }
  async deleteWarning(warnId, moderator) {
    const warning = await warningRepository.getWarningById(warnId);
    if (!warning || warning.active === false) {
      throw new Error(
        t("commands.warn.subcommands.edit.notFound", { defaultValue: "Warning not found" })
      );
    }
    const deleted = await warningRepository.deactivateWarning(warnId, moderator.id);
    await auditLogger.logAction({
      action: "WARN_DELETE",
      userId: moderator.id,
      guildId: warning.guildId,
      targetId: warning.userId,
      details: { warnId }
    });
    return deleted;
  }
  async checkAutomations(guild, user) {
    const stats = await warningRepository.getUserWarningStats(guild.id, user.id);
    const automations = await warningRepository.getActiveAutomations(guild.id);
    for (const automation of automations) {
      let shouldTrigger = false;
      if (automation.triggerType === "warn_count" && stats.count >= automation.triggerValue) {
        shouldTrigger = true;
      } else if (automation.triggerType === "warn_level" && stats.totalLevel >= automation.triggerValue) {
        shouldTrigger = true;
      }
      if (shouldTrigger) {
        if (automation.lastTriggeredAt) {
          const hourAgo = new Date(Date.now() - 60 * 60 * 1e3);
          if (automation.lastTriggeredAt > hourAgo) {
            continue;
          }
        }
        await this.executeAutomation(guild, user, automation, stats);
        await warningRepository.updateAutomationLastTriggered(automation.automationId);
      }
    }
  }
  async executeAutomation(guild, user, automation, stats) {
    const actions = automation.actions;
    const notificationChannel = await this.resolveNotificationChannel(guild, automation);
    if (notificationChannel) {
      const embed = new EmbedBuilder().setColor(16711680).setTitle(t("warnings.automation.triggered")).setDescription(
        t("warnings.automation.description", {
          user: user.tag,
          userId: user.id,
          automation: automation.name,
          count: stats.count,
          level: stats.totalLevel
        })
      ).setTimestamp();
      const row = new ActionRowBuilder();
      for (const action of actions) {
        if (action.type === "ban") {
          row.addComponents(
            new ButtonBuilder().setCustomId(`warn_action:ban:${user.id}`).setLabel(t("warnings.actions.ban")).setStyle(ButtonStyle.Danger)
          );
        } else if (action.type === "kick") {
          row.addComponents(
            new ButtonBuilder().setCustomId(`warn_action:kick:${user.id}`).setLabel(t("warnings.actions.kick")).setStyle(ButtonStyle.Danger)
          );
        } else if (action.type === "mute" && action.duration) {
          row.addComponents(
            new ButtonBuilder().setCustomId(`warn_action:mute:${user.id}:${action.duration}`).setLabel(t("warnings.actions.mute", { duration: action.duration })).setStyle(ButtonStyle.Secondary)
          );
        } else if (action.type === "timeout" && action.duration) {
          const formattedDuration = formatAutomationDuration(action.duration);
          row.addComponents(
            new ButtonBuilder().setCustomId(`warn_action:timeout:${user.id}:${action.duration}`).setLabel(t("warnings.actions.timeout", { duration: formattedDuration })).setStyle(ButtonStyle.Secondary)
          );
        }
      }
      row.addComponents(
        new ButtonBuilder().setCustomId(`warn_view:${user.id}`).setLabel(t("warnings.actions.view")).setStyle(ButtonStyle.Primary)
      );
      await notificationChannel.send({
        embeds: [embed],
        components: row.components.length > 0 ? [row] : []
      });
    }
    const targetMember = await guild.members.fetch(user.id).catch(() => null);
    for (const action of actions) {
      if (action.type === "message" && action.message) {
        try {
          await user.send(action.message);
        } catch (error) {
        }
      } else if (action.type === "role" && action.roleId) {
        if (targetMember) {
          await targetMember.roles.add(action.roleId).catch(() => {
          });
        }
      } else if (action.type === "kick") {
        if (targetMember?.kickable) {
          await targetMember.kick(`Warning automation ${automation.name}`).catch((error) => this.logAutomationError("kick", user.id, guild.id, error));
        }
      } else if (action.type === "ban") {
        await guild.members.ban(user.id, { reason: `Warning automation ${automation.name}` }).catch((error) => this.logAutomationError("ban", user.id, guild.id, error));
      } else if (action.type === "timeout" && action.duration && targetMember) {
        const timeoutMs = action.duration * 60 * 1e3;
        if (targetMember.moderatable) {
          await targetMember.disableCommunicationUntil(
            new Date(Date.now() + timeoutMs),
            `Warning automation ${automation.name}`
          ).catch((error) => this.logAutomationError("timeout", user.id, guild.id, error));
        }
      } else if (action.type === "mute" && action.duration && targetMember) {
        const muteRole = await this.ensureMuteRole(guild);
        if (muteRole) {
          await targetMember.roles.add(muteRole, `Warning automation ${automation.name}`).catch((error) => this.logAutomationError("mute", user.id, guild.id, error));
          setTimeout(
            () => {
              void targetMember.roles.remove(muteRole, "Warning automation mute expired").catch(() => {
              });
            },
            action.duration * 60 * 1e3
          );
        }
      }
    }
  }
  logAutomationError(action, userId, guildId, error) {
    logger.warn(
      `Failed to execute automation action "${action}" for user ${userId} in guild ${guildId}:`,
      error
    );
  }
  async ensureMuteRole(guild) {
    let muteRole = guild.roles.cache.find((role) => role.name === "Muted");
    if (muteRole) return muteRole;
    try {
      muteRole = await guild.roles.create({
        name: "Muted",
        color: 8421504,
        permissions: [],
        reason: "Auto-created mute role for warning automation"
      });
      await Promise.all(
        guild.channels.cache.map(async (channel) => {
          const roleId = muteRole?.id;
          if (!roleId) {
            return;
          }
          if (channel.isTextBased() && "permissionOverwrites" in channel) {
            await channel.permissionOverwrites.create(roleId, {
              SendMessages: false,
              AddReactions: false,
              Speak: false
            }).catch(() => {
            });
          }
        })
      );
    } catch (error) {
      logger.error("Failed to create mute role for warning automation:", error);
      return null;
    }
    return muteRole;
  }
  async resolveNotificationChannel(guild, automation) {
    const botMember = guild.members.me;
    if (automation.notifyChannelId) {
      const fetched = await guild.channels.fetch(automation.notifyChannelId).catch(() => null);
      if (fetched && fetched.type === ChannelType.GuildText && botMember && fetched.permissionsFor(botMember)?.has("SendMessages")) {
        return fetched;
      }
    }
    const fallback = guild.systemChannel || guild.channels.cache.find(
      (ch) => ch.type === ChannelType.GuildText && (botMember ? ch.permissionsFor(botMember)?.has("SendMessages") === true : false)
    );
    return fallback || null;
  }
  async getWarningEmbed(warning, guild) {
    const user = await guild.client.users.fetch(warning.userId).catch(() => null);
    const moderator = await guild.client.users.fetch(warning.moderatorId).catch(() => null);
    const embed = new EmbedBuilder().setColor(16753920).setTitle(t("warnings.embed.title", { warnId: warning.warnId })).addFields(
      {
        name: t("warnings.embed.user"),
        value: user ? `${user.tag} (${user.id})` : warning.userId,
        inline: true
      },
      {
        name: t("warnings.embed.moderator"),
        value: moderator ? `${moderator.tag}` : warning.moderatorId,
        inline: true
      },
      {
        name: t("warnings.embed.level"),
        value: warning.level.toString(),
        inline: true
      },
      {
        name: t("warnings.embed.title"),
        value: warning.title,
        inline: false
      }
    ).setTimestamp(warning.createdAt);
    if (warning.description) {
      embed.addFields({
        name: t("warnings.embed.description"),
        value: warning.description,
        inline: false
      });
    }
    if (warning.proof) {
      embed.setImage(warning.proof);
    }
    if (warning.editedAt && warning.editedBy) {
      const editor = await guild.client.users.fetch(warning.editedBy).catch(() => null);
      embed.setFooter({
        text: t("warnings.embed.edited", {
          editor: editor ? editor.tag : warning.editedBy,
          date: warning.editedAt.toLocaleString()
        })
      });
    }
    return embed;
  }
  async createAutomation(guild, name, description, triggerType, triggerValue, actions, createdBy, notifyChannelId) {
    const automation = await warningRepository.createAutomation({
      guildId: guild.id,
      name,
      description,
      triggerType,
      triggerValue,
      actions,
      createdBy: createdBy.id,
      notifyChannelId
    });
    await auditLogger.logAction({
      action: "WARN_AUTOMATION_CREATE",
      userId: createdBy.id,
      guildId: guild.id,
      details: {
        automationId: automation.automationId,
        name,
        triggerType,
        triggerValue,
        notifyChannelId
      }
    });
    return automation;
  }
  async deleteAutomation(automationId, deletedBy) {
    const automation = await warningRepository.deleteAutomation(automationId);
    if (automation) {
      await auditLogger.logAction({
        action: "WARN_AUTOMATION_DELETE",
        userId: deletedBy.id,
        guildId: automation.guildId,
        details: {
          automationId: automation.automationId,
          name: automation.name
        }
      });
    }
    return automation;
  }
  async purgeWarnings(guild, target, moderator) {
    const result = await warningRepository.purgeWarnings(guild.id, target.id, moderator.id);
    await auditLogger.logAction({
      action: "WARN_PURGE",
      userId: moderator.id,
      guildId: guild.id,
      targetId: target.id,
      details: {
        count: result.count
      }
    });
    return result;
  }
}
export const warningService = new WarningService();
