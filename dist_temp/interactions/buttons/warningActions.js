"use strict";
import {
  PermissionFlagsBits,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} from "discord.js";
import { warningRepository } from "../../repositories/warningRepository";
import { t } from "../../i18n";
export async function handleWarningActionButtons(interaction) {
  const [prefix, action, ...params] = interaction.customId.split(":");
  if (prefix === "warn_action") {
    return handleWarningAction(interaction, action, params);
  } else if (prefix === "warn_view") {
    return handleWarningView(interaction, params[0]);
  } else if (prefix === "warn_automation_modal") {
    return handleAutomationModalButton(interaction, action, params);
  }
}
async function handleWarningAction(interaction, action, params) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
    await interaction.reply({
      content: t("common.noPermission"),
      ephemeral: true
    });
    return;
  }
  const userId = params[0];
  const member = await interaction.guild.members.fetch(userId).catch(() => null);
  if (!member) {
    await interaction.reply({
      content: t("commands.moderation.subcommands.ban.memberNotFound"),
      ephemeral: true
    });
    return;
  }
  const botMember = interaction.guild.members.me;
  const executorMember = interaction.member;
  if (member.roles.highest.position >= botMember.roles.highest.position) {
    await interaction.reply({
      content: t("commands.moderation.subcommands.ban.botHierarchy"),
      ephemeral: true
    });
    return;
  }
  if (member.roles.highest.position >= executorMember.roles.highest.position) {
    await interaction.reply({
      content: t("commands.moderation.subcommands.ban.higherRole"),
      ephemeral: true
    });
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  try {
    switch (action) {
      case "ban":
        await member.ban({ reason: "Warning threshold reached" });
        await interaction.editReply({
          content: t("commands.moderation.subcommands.ban.success.description", {
            user: member.user.tag,
            moderator: interaction.user.tag
          })
        });
        break;
      case "kick":
        await member.kick("Warning threshold reached");
        await interaction.editReply({
          content: t("commands.moderation.subcommands.kick.success.description", {
            user: member.user.tag,
            moderator: interaction.user.tag
          })
        });
        break;
      case "timeout": {
        const durationMinutes = parseInt(params[1]) || 60;
        const durationMs = durationMinutes * 60 * 1e3;
        if (!member.moderatable) {
          await interaction.editReply({
            content: t("commands.moderation.subcommands.timeout.cannotTimeout")
          });
          return;
        }
        await member.timeout(durationMs, "Warning threshold reached");
        await interaction.editReply({
          content: t("commands.moderation.subcommands.timeout.success.description", {
            user: member.user.tag,
            duration: formatActionDuration(durationMinutes),
            moderator: interaction.user.tag
          })
        });
        break;
      }
      case "mute":
        const duration = parseInt(params[1]) || 60;
        const muteRole = interaction.guild.roles.cache.find((r) => r.name.toLowerCase() === "muted");
        if (!muteRole) {
          await interaction.editReply({
            content: t("commands.moderation.subcommands.mute.error")
          });
          return;
        }
        await member.roles.add(muteRole, "Warning threshold reached");
        setTimeout(
          async () => {
            try {
              await member.roles.remove(muteRole);
            } catch (error) {
            }
          },
          duration * 60 * 1e3
        );
        await interaction.editReply({
          content: `${t("commands.moderation.subcommands.mute.success.description", {
            user: member.user.tag,
            moderator: interaction.user.tag
          })} (${duration}m)`
        });
        break;
      default:
        await interaction.editReply({
          content: t("common.error")
        });
        return;
    }
    const message = interaction.message;
    const embed = message.embeds[0];
    if (embed) {
      const updatedEmbed = EmbedBuilder.from(embed).addFields({
        name: t("commands.warn.subcommands.automation.create.modal.action"),
        value: `${action.charAt(0).toUpperCase() + action.slice(1)} by ${interaction.user.tag}`,
        inline: false
      });
      await message.edit({ embeds: [updatedEmbed], components: [] });
    }
  } catch (error) {
    console.error("Error executing warning action:", error);
    await interaction.editReply({
      content: t("common.error")
    });
  }
}
const formatActionDuration = (minutes) => {
  if (!minutes || Number.isNaN(minutes)) {
    return "unknown duration";
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
async function handleWarningView(interaction, userId) {
  await interaction.deferReply({ ephemeral: true });
  const warnings = await warningRepository.getUserWarnings(interaction.guild.id, userId);
  const stats = await warningRepository.getUserWarningStats(interaction.guild.id, userId);
  const user = await interaction.client.users.fetch(userId).catch(() => null);
  if (warnings.length === 0) {
    await interaction.editReply({
      content: t("commands.warn.subcommands.view.noWarnings", { user: user?.tag || userId })
    });
    return;
  }
  const embed = new EmbedBuilder().setColor(16753920).setTitle(t("commands.warn.subcommands.view.title", { user: user?.tag || userId })).setDescription(
    t("commands.warn.subcommands.view.stats", {
      count: stats.count,
      level: stats.totalLevel
    })
  ).setTimestamp();
  const warningsToShow = warnings.slice(0, 10);
  for (const warning of warningsToShow) {
    embed.addFields({
      name: `${warning.warnId} - Level ${warning.level}`,
      value: `**${warning.title}**
${warning.description || t("common.noReasonProvided")}
<t:${Math.floor(warning.createdAt.getTime() / 1e3)}:R>`,
      inline: false
    });
  }
  if (warnings.length > 10) {
    embed.setFooter({
      text: t("commands.warn.subcommands.view.stats", {
        count: warnings.length,
        level: stats.totalLevel
      })
    });
  }
  await interaction.editReply({ embeds: [embed] });
}
async function handleAutomationModalButton(interaction, ownerId, params) {
  if (interaction.user.id !== ownerId) {
    await interaction.reply({
      content: t("common.notYourButton"),
      ephemeral: true
    });
    return;
  }
  const [triggerType, triggerValue, notifyChannelParam] = params;
  if (!triggerType || !triggerValue) {
    await interaction.reply({
      content: t("commands.warn.subcommands.automation.create.missingTrigger"),
      ephemeral: true
    });
    return;
  }
  const notifyChannelId = notifyChannelParam && notifyChannelParam !== "none" ? notifyChannelParam : void 0;
  const modal = new ModalBuilder().setCustomId(
    `warn_automation_create:${triggerType}:${triggerValue}:${notifyChannelId ?? "none"}`
  ).setTitle(truncateLabel(t("commands.warn.subcommands.automation.create.modal.title"), 45));
  const nameInput = new TextInputBuilder().setCustomId("name").setLabel(truncateLabel(t("commands.warn.subcommands.automation.create.modal.name"))).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(255);
  const descriptionInput = new TextInputBuilder().setCustomId("description").setLabel(truncateLabel(t("commands.warn.subcommands.automation.create.modal.description"))).setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1e3);
  const actionInput = new TextInputBuilder().setCustomId("action").setLabel(truncateLabel(t("commands.warn.subcommands.automation.create.modal.action"))).setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(t("commands.warn.subcommands.automation.create.modal.action"));
  const messageInput = new TextInputBuilder().setCustomId("message").setLabel(truncateLabel(t("commands.warn.subcommands.automation.create.modal.message"))).setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1e3).setPlaceholder(t("commands.warn.subcommands.automation.create.modal.message"));
  const rows = [
    new ActionRowBuilder().addComponents(nameInput),
    new ActionRowBuilder().addComponents(descriptionInput),
    new ActionRowBuilder().addComponents(actionInput),
    new ActionRowBuilder().addComponents(messageInput)
  ];
  modal.addComponents(...rows);
  await interaction.showModal(modal);
}
const MAX_LABEL_LENGTH = 45;
const truncateLabel = (value, maxLength = MAX_LABEL_LENGTH) => {
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(0, maxLength);
};
