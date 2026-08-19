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
export const data = new SlashCommandBuilder().setName("kick").setDescription(t("commands.moderation.subcommands.kick.description")).addUserOption(
  (option) => option.setName("user").setDescription(t("commands.moderation.subcommands.kick.options.user")).setRequired(true)
).addStringOption(
  (option) => option.setName("reason").setDescription(t("commands.moderation.subcommands.kick.options.reason")).setRequired(false).setMaxLength(500)
).setDefaultMemberPermissions(PermissionFlagsBits.KickMembers);
export const category = CommandCategory.Moderation;
export const cooldown = 3;
export const permissions = [PermissionFlagsBits.KickMembers];
export async function execute(interaction) {
  await interaction.deferReply();
  const user = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason") || t("common.noReasonProvided");
  await ensureUserAndGuildExist(user, interaction.guild);
  await ensureUserAndGuildExist(interaction.user, interaction.guild);
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!member) {
    return interaction.editReply({
      content: t("commands.moderation.subcommands.kick.memberNotFound")
    });
  }
  if (user.id === interaction.user.id) {
    return interaction.editReply({
      content: t("commands.moderation.subcommands.kick.cannotKickSelf")
    });
  }
  if (user.id === interaction.client.user.id) {
    return interaction.editReply({
      content: t("commands.moderation.subcommands.kick.cannotKickBot")
    });
  }
  const executorMember = interaction.member;
  const botMember = interaction.guild.members.me;
  if (!member.kickable) {
    return interaction.editReply({
      content: t("commands.moderation.subcommands.kick.cannotKick")
    });
  }
  if (member.roles.highest.position >= executorMember.roles.highest.position) {
    return interaction.editReply({
      content: t("commands.moderation.subcommands.kick.higherRole")
    });
  }
  if (member.roles.highest.position >= botMember.roles.highest.position) {
    return interaction.editReply({
      content: t("commands.moderation.subcommands.kick.botHierarchy")
    });
  }
  try {
    try {
      const dmEmbed = new EmbedBuilder().setColor(16753920).setTitle(t("commands.moderation.subcommands.kick.dmTitle")).setDescription(
        t("commands.moderation.subcommands.kick.dmDescription", {
          guild: interaction.guild.name,
          reason
        })
      ).setTimestamp();
      await user.send({ embeds: [dmEmbed] });
    } catch (error) {
    }
    await member.kick(`${reason} | Kicked by ${interaction.user.tag}`);
    await recordModCase(interaction, user.id, "kick", reason);
    await auditLogger.logAction({
      action: "MEMBER_KICK",
      userId: interaction.user.id,
      guildId: interaction.guild.id,
      targetId: user.id,
      details: {
        reason
      }
    });
    const embed = new EmbedBuilder().setColor(16753920).setTitle(t("commands.moderation.subcommands.kick.success.title")).setDescription(
      t("commands.moderation.subcommands.kick.success.description", {
        user: user.tag,
        moderator: interaction.user.tag
      })
    ).addFields({
      name: t("commands.moderation.subcommands.kick.success.reason"),
      value: reason,
      inline: false
    }).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("Error kicking member:", error);
    await interaction.editReply({
      content: t("commands.moderation.subcommands.kick.error")
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
