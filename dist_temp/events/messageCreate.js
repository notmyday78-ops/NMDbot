"use strict";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Events
} from "discord.js";
import { xpService } from "../services/xpService";
import { configurationService } from "../services/configurationService";
import { guildService } from "../services/guildService";
import { listCommandService } from "../services/listCommandService";
import { logger } from "../utils/logger";
import { getTranslation, t } from "../i18n";
import { wordFilterService } from "../services/wordFilterService";
import { modLogService } from "../services/modLogService";
import { autoModService } from "../services/autoModService";
import { aiService } from "../services/aiService";
import { engagementService } from "../services/engagementService";
import { cacheService } from "../services/cacheService";
import { evaluateHoneypot } from "../services/honeypotService";
const WORD_FILTER_SEVERITY_WEIGHT = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3
};
const WORD_FILTER_COLOR = {
  low: 16705372,
  medium: 16753920,
  high: 15548997,
  critical: 10038562
};
const ACTION_PRIORITY = {
  ban: 0,
  kick: 1,
  timeout: 2,
  warn: 3,
  delete: 4,
  note: 5
};
const FILTER_ACTION_PREFIX = "filter_action";
const MAX_MATCH_DISPLAY = 10;
export const name = Events.MessageCreate;
export const once = false;
export async function execute(message) {
  if (message.author.bot) return;
  if (!message.guild || !message.member) return;
  try {
    const guildData = await guildService.ensureGuild(message.guild);
    const guildSettings = await cacheService.getGuildSettings(message.guild.id, async () => {
      return await guildService.getGuildSettings(message.guild.id);
    });
    const honeypotTriggered = await evaluateHoneypot(message, guildSettings);
    if (honeypotTriggered) return;
    const { stickyMessageService } = await import("../services/stickyMessageService");
    await stickyMessageService.evaluateMessage(message, guildSettings);
    const autoModTriggered = await autoModService.evaluateMessage(message);
    if (autoModTriggered) return;
    const aiHandled = await aiService.evaluateMessage(message);
    if (aiHandled) return;
    const handled = await listCommandService.handle(message);
    if (handled) return;
    try {
      const customCommands = guildSettings?.parsedCustomCommands || [];
      if (customCommands.length > 0) {
        for (const cmd of customCommands) {
          const prefix = cmd.prefix || guildData.prefix;
          if (prefix && message.content.startsWith(prefix)) {
            const args = message.content.slice(prefix.length).trim().split(/ +/);
            const commandName = args.shift()?.toLowerCase();
            const expectedName = cmd.name?.toLowerCase() || "";
            if (commandName && (commandName === expectedName || `${prefix.toLowerCase()}${commandName}` === expectedName)) {
              const restrictChannel = cmd.channelId || guildSettings.customCommandsChannel;
              if (restrictChannel && message.channel.id !== restrictChannel) {
                continue;
              }
              if (cmd.responseType === "embed") {
                const embed = new EmbedBuilder().setTitle(cmd.embedTitle || "Custom Command").setDescription(cmd.embedDescription || " ").setColor(cmd.embedColor || "#3498db");
                if (cmd.embedFooter) embed.setFooter({ text: cmd.embedFooter });
                if (cmd.embedThumbnail) embed.setThumbnail(cmd.embedThumbnail);
                if (cmd.embedImage) embed.setImage(cmd.embedImage);
                await message.reply({ embeds: [embed] });
                return;
              } else if (cmd.response || cmd.reply) {
                await message.reply(cmd.response || cmd.reply);
                return;
              }
            }
          }
        }
      }
    } catch (e) {
      logger.error(`Failed to parse custom commands for guild ${message.guild.id}:`, e);
    }
    const filtered = await handleWordFilter(message);
    if (filtered) return;
    await engagementService.trackMessageActivity(message);
    await processXPGain(message);
  } catch (error) {
    logger.error("Error in messageCreate event:", error);
  }
}
async function handleWordFilter(message) {
  if (!message.guild || !message.member) return false;
  try {
    const content = buildFilterContent(message);
    const violations = await wordFilterService.findViolations(message.guild.id, content);
    if (violations.length === 0) {
      return false;
    }
    const deletion = await deleteFilteredMessageIfNeeded(message, violations);
    await notifyFilteredUser(message, violations, deletion);
    await dispatchWordFilterReport(message, violations, deletion);
    return true;
  } catch (error) {
    logger.error("Failed to handle word filter violation:", error);
    return false;
  }
}
function buildFilterContent(message) {
  const segments = [];
  if (message.content) {
    segments.push(message.content);
  }
  for (const attachment of message.attachments.values()) {
    if (attachment.name) {
      segments.push(attachment.name);
    }
    if (typeof attachment.description === "string") {
      segments.push(attachment.description);
    }
  }
  return segments.join(" ").trim();
}
async function deleteFilteredMessageIfNeeded(message, violations) {
  const shouldDelete = violations.some((violation) => violation.rule.autoDelete);
  if (!shouldDelete) {
    return { attempted: false, deleted: false };
  }
  if (!message.deletable) {
    return {
      attempted: true,
      deleted: false,
      error: "missing permissions"
    };
  }
  try {
    await message.delete();
    return { attempted: true, deleted: true };
  } catch (error) {
    logger.warn(`Failed to delete filtered message ${message.id}:`, error);
    return {
      attempted: true,
      deleted: false,
      error: error.message
    };
  }
}
async function notifyFilteredUser(message, violations, deletion) {
  const guild = message.guild;
  if (!guild) return;
  const ruleSummaries = violations.map((violation) => `\u2022 ${violation.rule.pattern}`).join("\n");
  const statusKey = deletion.deleted ? "modLogs.filter.status.deleted" : deletion.attempted ? "modLogs.filter.status.failed" : "modLogs.filter.status.kept";
  try {
    await message.author.send(
      t("modLogs.filter.notifyUser", {
        guild: guild.name,
        status: t(statusKey),
        rules: ruleSummaries
      })
    );
  } catch (error) {
    logger.debug(`Failed to notify user ${message.author.id} about word filter action:`, error);
  }
}
async function dispatchWordFilterReport(message, violations, deletion) {
  const guild = message.guild;
  if (!guild) return;
  const primaryViolation = selectPrimaryViolation(violations);
  const embed = buildFilterEmbed(message, violations, primaryViolation, deletion);
  const components = buildFilterActionRows(message, violations, primaryViolation);
  const payload = {
    embeds: [embed],
    components
  };
  let delivered = false;
  if (primaryViolation.rule.notifyChannelId) {
    delivered = await modLogService.sendDirect(
      guild,
      primaryViolation.rule.notifyChannelId,
      payload
    );
  }
  if (!delivered) {
    const wordFilterSetting = await modLogService.getSetting(guild.id, "wordFilter");
    if (wordFilterSetting?.enabled) {
      await modLogService.sendLog(guild, "wordFilter", payload);
      delivered = true;
    }
  }
  if (!delivered) {
    await modLogService.sendLog(guild, "message", payload);
  }
}
function selectPrimaryViolation(violations) {
  return violations.reduce((best, current) => {
    const bestWeight = WORD_FILTER_SEVERITY_WEIGHT[best.rule.severity];
    const currentWeight = WORD_FILTER_SEVERITY_WEIGHT[current.rule.severity];
    if (currentWeight > bestWeight) {
      return current;
    }
    if (currentWeight === bestWeight && current.matches.length > best.matches.length) {
      return current;
    }
    return best;
  });
}
function buildFilterEmbed(message, violations, primaryViolation, deletion) {
  const channelMention = message.channelId ? `<#${message.channelId}>` : t("common.unknown");
  const matches = formatMatches(violations);
  const rules = formatRules(violations);
  const messageLink = `https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}`;
  let statusKey = "modLogs.filter.status.kept";
  if (deletion.deleted) {
    statusKey = "modLogs.filter.status.deleted";
  } else if (deletion.attempted) {
    statusKey = "modLogs.filter.status.failed";
  }
  const embed = new EmbedBuilder().setColor(WORD_FILTER_COLOR[primaryViolation.rule.severity]).setTitle(t("modLogs.filter.triggered.title")).setDescription(
    t("modLogs.filter.triggered.description", {
      user: `${message.author.tag} (${message.author.id})`
    })
  ).addFields(
    {
      name: t("modLogs.fields.channel"),
      value: channelMention,
      inline: true
    },
    {
      name: t("modLogs.filter.fields.status"),
      value: t(statusKey, { error: deletion.error ?? "" }),
      inline: true
    },
    {
      name: t("modLogs.filter.fields.matches"),
      value: matches,
      inline: false
    },
    {
      name: t("modLogs.filter.fields.rules"),
      value: rules,
      inline: false
    },
    {
      name: t("modLogs.fields.messageLink"),
      value: messageLink,
      inline: false
    },
    {
      name: t("modLogs.fields.content"),
      value: formatMessageContent(message),
      inline: false
    }
  ).setTimestamp().setFooter({
    text: t("modLogs.filter.footer", {
      messageId: message.id,
      channelId: message.channelId
    })
  });
  if (message.attachments.size > 0) {
    const attachmentList = Array.from(message.attachments.values()).slice(0, 5).map((attachment) => attachment.url).join("\n");
    embed.addFields({
      name: t("modLogs.fields.attachments"),
      value: attachmentList,
      inline: false
    });
  }
  return embed;
}
function formatMessageContent(message) {
  const content = (message.cleanContent || message.content || "").trim();
  if (!content) {
    return t("modLogs.message.empty");
  }
  const truncated = content.length > 1010 ? `${content.slice(0, 1007)}...` : content;
  return `\`\`\`${truncated}\`\`\``;
}
function formatMatches(violations) {
  const uniqueMatches = /* @__PURE__ */ new Set();
  for (const violation of violations) {
    for (const match of violation.matches) {
      uniqueMatches.add(match);
    }
  }
  if (uniqueMatches.size === 0) {
    return t("modLogs.filter.fields.noMatches");
  }
  const matches = Array.from(uniqueMatches).slice(0, MAX_MATCH_DISPLAY);
  const remaining = uniqueMatches.size - matches.length;
  let formatted = matches.map((match) => `\`${match}\``).join(", ");
  if (remaining > 0) {
    formatted += t("modLogs.filter.fields.moreMatches", { count: remaining });
  }
  return formatted;
}
function formatRules(violations) {
  return violations.map(
    (violation) => t("modLogs.filter.fields.ruleEntry", {
      id: violation.rule.id,
      severity: t(`modLogs.filter.severity.${violation.rule.severity}`),
      pattern: violation.rule.pattern,
      matchType: t(`modLogs.filter.matchType.${violation.rule.matchType}`)
    })
  ).join("\n");
}
function buildFilterActionRows(message, violations, primaryViolation) {
  const actions = collectFilterActions(violations).sort((a, b) => {
    const priorityDiff = ACTION_PRIORITY[a.type] - ACTION_PRIORITY[b.type];
    if (priorityDiff !== 0) return priorityDiff;
    const durationA = a.durationSeconds ?? 0;
    const durationB = b.durationSeconds ?? 0;
    return durationB - durationA;
  });
  const limitedActions = actions.slice(0, 4);
  const buttons = limitedActions.map(
    (action) => createActionButton(action, message, primaryViolation.rule.id)
  );
  const dismissButton = new ButtonBuilder().setCustomId(
    `${FILTER_ACTION_PREFIX}|dismiss|${message.author.id}|${primaryViolation.rule.id}|0`
  ).setLabel(t("modLogs.filter.actions.label.dismiss")).setStyle(ButtonStyle.Secondary);
  buttons.push(dismissButton);
  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(...buttons.slice(i, i + 5)));
  }
  return rows;
}
function collectFilterActions(violations) {
  const actionMap = /* @__PURE__ */ new Map();
  for (const violation of violations) {
    const ruleActions = violation.rule.actions.length > 0 ? violation.rule.actions : wordFilterService.inferDefaultActions(violation.rule.severity);
    for (const action of ruleActions) {
      if (action.type === "delete" || action.type === "note") continue;
      const key = `${action.type}:${action.durationSeconds ?? 0}`;
      if (!actionMap.has(key)) {
        actionMap.set(key, action);
      }
    }
  }
  return Array.from(actionMap.values());
}
function createActionButton(action, message, primaryRuleId) {
  const customId = buildActionCustomId(action, message, primaryRuleId);
  const label = buildActionLabel(action);
  const style = getActionStyle(action.type);
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}
function buildActionCustomId(action, message, primaryRuleId) {
  const duration = action.durationSeconds ?? 0;
  return `${FILTER_ACTION_PREFIX}|${action.type}|${message.author.id}|${primaryRuleId}|${duration}`;
}
function buildActionLabel(action) {
  switch (action.type) {
    case "warn":
      return t("modLogs.filter.actions.label.warn");
    case "timeout": {
      const duration = formatDuration(action.durationSeconds);
      return t("modLogs.filter.actions.label.timeout", { duration });
    }
    case "kick":
      return t("modLogs.filter.actions.label.kick");
    case "ban":
      return t("modLogs.filter.actions.label.ban");
    default:
      return action.type;
  }
}
function getActionStyle(actionType) {
  switch (actionType) {
    case "ban":
    case "kick":
      return ButtonStyle.Danger;
    case "timeout":
      return ButtonStyle.Secondary;
    case "warn":
    default:
      return ButtonStyle.Primary;
  }
}
function formatDuration(durationSeconds) {
  if (!durationSeconds || durationSeconds <= 0) {
    return t("modLogs.filter.actions.defaultDuration");
  }
  if (durationSeconds < 60) {
    return t("modLogs.filter.actions.durationSeconds", { count: durationSeconds });
  }
  if (durationSeconds < 3600) {
    const minutes = Math.round(durationSeconds / 60);
    return t("modLogs.filter.actions.durationMinutes", { count: minutes });
  }
  const hours = Math.round(durationSeconds / 3600);
  return t("modLogs.filter.actions.durationHours", { count: hours });
}
async function processXPGain(message) {
  if (!message.guild || !message.member) return;
  try {
    const config = await configurationService.getXPConfig(message.guild.id);
    if (!config.enabled) return;
    const result = await xpService.addXP(
      message.author.id,
      message.guild.id,
      message.member,
      config.perMessage,
      message.channel.id
    );
    if (!result || !result.leveledUp) return;
    if (config.announceLevelUp) {
      const locale = await getTranslation(message.guild.id, message.author.id);
      const xpLocale = locale.commands?.xp;
      const defaultMessage = xpLocale?.levelUp?.defaultMessage || "Congratulations {{user}}! You reached level {{level}}!";
      let levelUpMessage = config.levelUpMessage || defaultMessage;
      levelUpMessage = levelUpMessage.replace("{{user}}", message.author.toString()).replace("{{level}}", result.newLevel.toString()).replace("{{username}}", message.author.username);
      const targetChannel = config.levelUpChannel ? message.guild.channels.cache.get(config.levelUpChannel) : message.channel;
      if (targetChannel && targetChannel.isTextBased()) {
        const embed = new EmbedBuilder().setColor(65280).setTitle(xpLocale?.levelUp?.title || "Level Up!").setDescription(levelUpMessage).setThumbnail(message.author.displayAvatarURL()).setTimestamp();
        if (result.rewardRoles && result.rewardRoles.length > 0) {
          const roleRewards = result.rewardRoles.map((roleId) => `<@&${roleId}>`).join(", ");
          embed.addFields({
            name: xpLocale?.levelUp?.rolesEarned || "Roles Earned",
            value: roleRewards,
            inline: false
          });
          for (const roleId of result.rewardRoles) {
            try {
              const role = message.guild.roles.cache.get(roleId);
              if (role && message.member && !message.member.roles.cache.has(roleId)) {
                await message.member.roles.add(role);
              }
            } catch (error) {
              logger.error(`Failed to add role ${roleId} to member ${message.author.id}:`, error);
            }
          }
        }
        await targetChannel.send({ embeds: [embed] });
      }
    }
    if (result.rewardRoles && result.rewardRoles.length > 0 && !config.announceLevelUp) {
      for (const roleId of result.rewardRoles) {
        try {
          const role = message.guild.roles.cache.get(roleId);
          if (role && message.member && !message.member.roles.cache.has(roleId)) {
            await message.member.roles.add(role);
          }
        } catch (error) {
          logger.error(`Failed to add role ${roleId} to member ${message.author.id}:`, error);
        }
      }
    }
    if (result.rolesToRemove && result.rolesToRemove.length > 0) {
      for (const roleId of result.rolesToRemove) {
        try {
          if (message.member && message.member.roles.cache.has(roleId)) {
            await message.member.roles.remove(roleId);
          }
        } catch (error) {
          logger.error(`Failed to remove role ${roleId} from member ${message.author.id}:`, error);
        }
      }
    }
  } catch (error) {
    logger.error("Failed to process XP gain:", error);
  }
}
