"use strict";
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType
} from "discord.js";
import { CommandCategory } from "../../types/command";
import { t } from "../../i18n";
import { auditLogger } from "../../security/audit";
import { ensureUserAndGuildExist } from "../../utils/userUtils";
import { logger } from "../../utils/logger";
import { modCaseRepository } from "../../repositories/modCaseRepository";
export const data = new SlashCommandBuilder().setName("timeout").setDescription(t("commands.moderation.subcommands.timeout.description")).addUserOption(
  (option) => option.setName("user").setDescription(t("commands.moderation.subcommands.timeout.options.user")).setRequired(true)
).addIntegerOption(
  (option) => option.setName("duration").setDescription(t("commands.moderation.subcommands.timeout.options.duration")).setRequired(true).setMinValue(1).setMaxValue(40320).addChoices(
    {
      name: "60 seconds",
      value: 1,
      name_localizations: { de: "60 Sekunden", "es-ES": "60 segundos", fr: "60 secondes" }
    },
    {
      name: "5 minutes",
      value: 5,
      name_localizations: { de: "5 Minuten", "es-ES": "5 minutos", fr: "5 minutes" }
    },
    {
      name: "10 minutes",
      value: 10,
      name_localizations: { de: "10 Minuten", "es-ES": "10 minutos", fr: "10 minutes" }
    },
    {
      name: "30 minutes",
      value: 30,
      name_localizations: { de: "30 Minuten", "es-ES": "30 minutos", fr: "30 minutes" }
    },
    {
      name: "1 hour",
      value: 60,
      name_localizations: { de: "1 Stunde", "es-ES": "1 hora", fr: "1 heure" }
    },
    {
      name: "6 hours",
      value: 360,
      name_localizations: { de: "6 Stunden", "es-ES": "6 horas", fr: "6 heures" }
    },
    {
      name: "12 hours",
      value: 720,
      name_localizations: { de: "12 Stunden", "es-ES": "12 horas", fr: "12  heures" }
    },
    {
      name: "1 day",
      value: 1440,
      name_localizations: { de: "1 Tag", "es-ES": "1 d\xEDa", fr: "1 jour" }
    },
    {
      name: "3 days",
      value: 4320,
      name_localizations: { de: "3 Tage", "es-ES": "3 d\xEDas", fr: "3 jours" }
    },
    {
      name: "1 week",
      value: 10080,
      name_localizations: { de: "1 Woche", "es-ES": "1 semana", fr: "1  semaine" }
    },
    {
      name: "2 weeks",
      value: 20160,
      name_localizations: { de: "2 Wochen", "es-ES": "2 semanas", fr: "2  semaines" }
    },
    {
      name: "4 weeks",
      value: 40320,
      name_localizations: { de: "4 Wochen", "es-ES": "4 semanas", fr: "4  semaines" }
    }
  )
).addStringOption(
  (option) => option.setName("reason").setDescription(t("commands.moderation.subcommands.timeout.options.reason")).setRequired(false).setMaxLength(500)
).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);
export const category = CommandCategory.Moderation;
export const cooldown = 3;
export const permissions = [PermissionFlagsBits.ModerateMembers];
export async function execute(interaction) {
  await interaction.deferReply();
  const user = interaction.options.getUser("user", true);
  const duration = interaction.options.getInteger("duration", true);
  const reason = interaction.options.getString("reason") || t("common.noReasonProvided");
  await ensureUserAndGuildExist(user, interaction.guild);
  await ensureUserAndGuildExist(interaction.user, interaction.guild);
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!member) {
    return interaction.editReply({
      content: t("commands.moderation.subcommands.timeout.memberNotFound")
    });
  }
  if (user.id === interaction.user.id) {
    return interaction.editReply({
      content: t("commands.moderation.subcommands.timeout.cannotTimeoutSelf")
    });
  }
  if (user.id === interaction.client.user.id) {
    return interaction.editReply({
      content: t("commands.moderation.subcommands.timeout.cannotTimeoutBot")
    });
  }
  const executorMember = interaction.member;
  const botMember = interaction.guild.members.me;
  if (!member.moderatable) {
    return interaction.editReply({
      content: t("commands.moderation.subcommands.timeout.cannotTimeout")
    });
  }
  if (member.roles.highest.position >= executorMember.roles.highest.position) {
    return interaction.editReply({
      content: t("commands.moderation.subcommands.timeout.higherRole")
    });
  }
  if (member.roles.highest.position >= botMember.roles.highest.position) {
    return interaction.editReply({
      content: t("commands.moderation.subcommands.timeout.botHierarchy")
    });
  }
  try {
    const timeoutDuration = duration * 60 * 1e3;
    await member.timeout(timeoutDuration, `${reason} | Timed out by ${interaction.user.tag}`);
    await recordModCase(
      interaction,
      user.id,
      "timeout",
      reason,
      timeoutDuration,
      new Date(Date.now() + timeoutDuration)
    );
    try {
      const dmEmbed = new EmbedBuilder().setColor(8421504).setTitle(t("commands.moderation.subcommands.timeout.dmTitle")).setDescription(
        t("commands.moderation.subcommands.timeout.dmDescription", {
          guild: interaction.guild.name,
          duration: formatDuration(duration),
          reason
        })
      ).setTimestamp();
      await user.send({ embeds: [dmEmbed] });
    } catch (error) {
    }
    await auditLogger.logAction({
      action: "MEMBER_TIMEOUT",
      userId: interaction.user.id,
      guildId: interaction.guild.id,
      targetId: user.id,
      details: {
        duration,
        reason
      }
    });
    const embed = new EmbedBuilder().setColor(8421504).setTitle(t("commands.moderation.subcommands.timeout.success.title")).setDescription(
      t("commands.moderation.subcommands.timeout.success.description", {
        user: user.tag,
        duration: formatDuration(duration),
        moderator: interaction.user.tag
      })
    ).addFields({
      name: t("commands.moderation.subcommands.timeout.success.reason"),
      value: reason,
      inline: false
    }).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("Error timing out member:", error);
    await interaction.editReply({
      content: t("commands.moderation.subcommands.timeout.error")
    });
  }
}
function formatDuration(minutes) {
  const minStr = t("common.duration.minutes", {
    count: minutes,
    defaultValue: `${minutes} minute${minutes !== 1 ? "s" : ""}`
  });
  if (minutes < 60) {
    return minStr;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  const hrStr = t("common.duration.hours", {
    count: hours,
    defaultValue: `${hours} hour${hours !== 1 ? "s" : ""}`
  });
  if (hours < 24) {
    if (remainingMinutes === 0) {
      return hrStr;
    }
    const remMinStr = t("common.duration.minutes", {
      count: remainingMinutes,
      defaultValue: `${remainingMinutes} minute${remainingMinutes !== 1 ? "s" : ""}`
    });
    return `${hrStr} ${remMinStr}`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  const dayStr = t("common.duration.days", {
    count: days,
    defaultValue: `${days} day${days !== 1 ? "s" : ""}`
  });
  if (remainingHours === 0) {
    return dayStr;
  }
  const remHrStr = t("common.duration.hours", {
    count: remainingHours,
    defaultValue: `${remainingHours} hour${remainingHours !== 1 ? "s" : ""}`
  });
  return `${dayStr} ${remHrStr}`;
}
function resolveModerationChannel(interaction, channel) {
  if (channel && isModerationTextChannel(channel)) {
    return channel;
  }
  const currentChannel = interaction.channel;
  if (currentChannel && isModerationTextChannel(currentChannel)) {
    return currentChannel;
  }
  return null;
}
function isModerationTextChannel(channel) {
  if (!channel) {
    return false;
  }
  return channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement;
}
async function getOrCreateMuteRole(guild) {
  let muteRole = guild.roles.cache.find((role) => role.name.toLowerCase() === "muted") ?? null;
  if (!muteRole) {
    muteRole = await guild.roles.create({
      name: "Muted",
      color: 8421504,
      permissions: [],
      reason: "Mute role required for moderation commands"
    });
    for (const channel of guild.channels.cache.values()) {
      if (!("permissionOverwrites" in channel)) {
        continue;
      }
      try {
        await channel.permissionOverwrites.edit(muteRole, {
          SendMessages: false,
          AddReactions: false,
          Speak: false,
          Connect: false
        });
      } catch (error) {
        logger.debug(`Failed to set mute role permissions in channel ${channel.id}`, error);
      }
    }
  }
  return muteRole;
}
async function recordModCase(interaction, userId, type, reason, durationMs, expiresAt) {
  try {
    return await modCaseRepository.create({
      guildId: interaction.guild.id,
      userId,
      moderatorId: interaction.user.id,
      type,
      reason,
      duration: durationMs ?? null,
      expiresAt: expiresAt ?? null
    });
  } catch (error) {
    logger.error("Failed to record moderation case:", error);
    return null;
  }
}
