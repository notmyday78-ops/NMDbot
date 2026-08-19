"use strict";
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType
} from "discord.js";
import { CommandCategory } from "../../types/command";
import { t } from "../../i18n";
import { giveawayService } from "../../services/giveawayService";
import { logger } from "../../utils/logger";
export const data = new SlashCommandBuilder().setName("gw").setDescription(t("commands.giveaway.description")).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).addSubcommand(
  (subcommand) => subcommand.setName("start").setDescription(t("commands.giveaway.subcommands.start.description")).addStringOption(
    (option) => option.setName("prize").setDescription(t("commands.giveaway.subcommands.start.options.prize")).setRequired(true).setMaxLength(255)
  ).addStringOption(
    (option) => option.setName("duration").setDescription(t("commands.giveaway.subcommands.start.options.duration")).setRequired(true)
  ).addIntegerOption(
    (option) => option.setName("winners").setDescription(t("commands.giveaway.subcommands.start.options.winners")).setRequired(false).setMinValue(1).setMaxValue(20)
  ).addChannelOption(
    (option) => option.setName("channel").setDescription(t("commands.giveaway.subcommands.start.options.channel")).setRequired(false).addChannelTypes(ChannelType.GuildText)
  ).addStringOption((option) => option.setName("embed_title").setDescription("Custom embed title")).addAttachmentOption(
    (option) => option.setName("embed_image").setDescription("Custom embed image")
  ).addAttachmentOption(
    (option) => option.setName("embed_thumbnail").setDescription("Custom embed thumbnail")
  )
).addSubcommand(
  (subcommand) => subcommand.setName("simple").setDescription(t("commands.giveaway.subcommands.simple.description")).addStringOption(
    (option) => option.setName("prize").setDescription(t("commands.giveaway.subcommands.simple.options.prize")).setRequired(true).setMaxLength(255)
  ).addStringOption(
    (option) => option.setName("duration").setDescription(t("commands.giveaway.subcommands.simple.options.duration")).setRequired(true)
  ).addIntegerOption(
    (option) => option.setName("winners").setDescription(t("commands.giveaway.subcommands.simple.options.winners")).setRequired(true).setMinValue(1).setMaxValue(50)
  ).addStringOption((option) => option.setName("embed_title").setDescription("Custom embed title")).addAttachmentOption(
    (option) => option.setName("embed_image").setDescription("Custom embed image")
  ).addAttachmentOption(
    (option) => option.setName("embed_thumbnail").setDescription("Custom embed thumbnail")
  )
).addSubcommand(
  (subcommand) => subcommand.setName("end").setDescription(t("commands.giveaway.subcommands.end.description")).addStringOption(
    (option) => option.setName("giveaway_id").setDescription(t("commands.giveaway.subcommands.end.options.giveawayId")).setRequired(true)
  )
).addSubcommand(
  (subcommand) => subcommand.setName("reroll").setDescription(t("commands.giveaway.subcommands.reroll.description")).addStringOption(
    (option) => option.setName("giveaway_id").setDescription(t("commands.giveaway.subcommands.reroll.options.giveawayId")).setRequired(true)
  ).addIntegerOption(
    (option) => option.setName("winners").setDescription(t("commands.giveaway.subcommands.reroll.options.winners")).setRequired(false).setMinValue(1).setMaxValue(20)
  )
).addSubcommand(
  (subcommand) => subcommand.setName("configure").setDescription(t("commands.giveaway.subcommands.configure.description")).addStringOption(
    (option) => option.setName("giveaway_id").setDescription(t("commands.giveaway.subcommands.configure.options.giveawayId")).setRequired(true)
  ).addStringOption((option) => option.setName("embed_title").setDescription("Custom embed title")).addAttachmentOption(
    (option) => option.setName("embed_image").setDescription("Custom embed image")
  ).addAttachmentOption(
    (option) => option.setName("embed_thumbnail").setDescription("Custom embed thumbnail")
  )
);
export const category = CommandCategory.Utility;
export const cooldown = 5;
export const permissions = [PermissionFlagsBits.ManageGuild];
export async function execute(interaction) {
  if (!interaction.guild) {
    return interaction.reply({
      content: t("common.guildOnly"),
      ephemeral: true
    });
  }
  const subcommand = interaction.options.getSubcommand();
  switch (subcommand) {
    case "start":
      return handleStart(interaction);
    case "simple":
      return handleSimple(interaction);
    case "end":
      return handleEnd(interaction);
    case "reroll":
      return handleReroll(interaction);
    case "configure":
      return handleConfigure(interaction);
    default:
      return interaction.reply({
        content: t("common.unknownSubcommand"),
        ephemeral: true
      });
  }
}
async function handleStart(interaction) {
  const prize = interaction.options.getString("prize", true);
  const duration = interaction.options.getString("duration", true);
  const winners = interaction.options.getInteger("winners") || 1;
  const channel = interaction.options.getChannel("channel") || interaction.channel;
  const embedTitle = interaction.options.getString("embed_title");
  const embedImage = interaction.options.getAttachment("embed_image")?.url;
  const embedThumbnail = interaction.options.getAttachment("embed_thumbnail")?.url;
  if (embedTitle || embedImage || embedThumbnail) {
    giveawayService.startCommandEmbedCache.set(interaction.user.id, {
      embedTitle,
      embedImage,
      embedThumbnail
    });
  }
  const durationMs = parseDuration(duration);
  if (!durationMs) {
    return interaction.reply({
      content: t("commands.giveaway.invalidDuration"),
      ephemeral: true
    });
  }
  const modal = new ModalBuilder().setCustomId(`gw_start:${channel.id}:${prize}:${durationMs}:${winners}`).setTitle(t("commands.giveaway.subcommands.start.modal.title"));
  const descriptionInput = new TextInputBuilder().setCustomId("description").setLabel(t("commands.giveaway.subcommands.start.modal.description")).setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1e3);
  const requirementsInput = new TextInputBuilder().setCustomId("requirements").setLabel(t("commands.giveaway.subcommands.start.modal.requirements")).setStyle(TextInputStyle.Paragraph).setRequired(false).setPlaceholder(
    t("commands.giveaway.subcommands.start.modal.placeholders.requirements", {
      defaultValue: "role:123456789\nlevel:10\ntime:7d"
    })
  ).setMaxLength(500);
  const bonusEntriesInput = new TextInputBuilder().setCustomId("bonusEntries").setLabel(t("commands.giveaway.subcommands.start.modal.bonusEntries")).setStyle(TextInputStyle.Paragraph).setRequired(false).setPlaceholder(
    t("commands.giveaway.subcommands.start.modal.placeholders.bonusEntries", {
      defaultValue: "role:123456789:2\nbooster:3"
    })
  ).setMaxLength(500);
  const embedColorInput = new TextInputBuilder().setCustomId("embedColor").setLabel(t("commands.giveaway.subcommands.start.modal.embedColor")).setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder(
    t("commands.giveaway.subcommands.start.modal.placeholders.embedColor", {
      defaultValue: "#0099FF"
    })
  ).setMaxLength(7);
  const hostInput = new TextInputBuilder().setCustomId("host").setLabel(t("commands.giveaway.subcommands.start.modal.host")).setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder(
    t("commands.giveaway.subcommands.start.modal.placeholders.host", {
      defaultValue: "@username or Custom Name"
    })
  ).setMaxLength(100);
  const rows = [
    new ActionRowBuilder().addComponents(descriptionInput),
    new ActionRowBuilder().addComponents(requirementsInput),
    new ActionRowBuilder().addComponents(bonusEntriesInput),
    new ActionRowBuilder().addComponents(embedColorInput),
    new ActionRowBuilder().addComponents(hostInput)
  ];
  modal.addComponents(...rows);
  return interaction.showModal(modal);
}
async function handleSimple(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const prize = interaction.options.getString("prize", true);
  const duration = interaction.options.getString("duration", true);
  const winners = interaction.options.getInteger("winners", true);
  const channel = interaction.channel;
  const embedTitle = interaction.options.getString("embed_title");
  const embedImage = interaction.options.getAttachment("embed_image")?.url;
  const embedThumbnail = interaction.options.getAttachment("embed_thumbnail")?.url;
  const durationMs = parseDuration(duration);
  if (!durationMs) {
    return interaction.editReply({
      content: t("commands.giveaway.invalidDuration")
    });
  }
  try {
    const giveaway = await giveawayService.createGiveaway({
      guildId: interaction.guild.id,
      channelId: channel.id,
      hostedBy: interaction.user.id,
      prize,
      winnerCount: winners,
      endTime: new Date(Date.now() + durationMs),
      description: null,
      requirements: {},
      bonusEntries: {},
      embedTitle,
      embedColor: 39423,
      embedImage,
      embedThumbnail
    });
    const embed = new EmbedBuilder().setColor(39423).setTitle(embedTitle || t("commands.giveaway.embed.title")).setDescription(t("commands.giveaway.embed.simpleDescription", { prize })).addFields(
      {
        name: t("commands.giveaway.embed.hostedBy"),
        value: `<@${interaction.user.id}>`,
        inline: true
      },
      {
        name: t("commands.giveaway.embed.winners"),
        value: winners.toString(),
        inline: true
      },
      {
        name: t("commands.giveaway.embed.endsAt"),
        value: `<t:${Math.floor(giveaway.endTime.getTime() / 1e3)}:R>`,
        inline: true
      }
    ).setFooter({
      text: t("commands.giveaway.embed.footer", { id: giveaway.giveawayId })
    }).setTimestamp(giveaway.endTime);
    if (embedImage) embed.setImage(embedImage);
    if (embedThumbnail) embed.setThumbnail(embedThumbnail);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`gw_enter:${giveaway.giveawayId}`).setLabel(t("commands.giveaway.buttons.enter")).setStyle(ButtonStyle.Primary).setEmoji("\u{1F389}"),
      new ButtonBuilder().setCustomId(`gw_info:${giveaway.giveawayId}`).setLabel(t("commands.giveaway.buttons.info")).setStyle(ButtonStyle.Secondary).setEmoji("\u2139\uFE0F")
    );
    const message = await channel.send({
      embeds: [embed],
      components: [row]
    });
    await giveawayService.updateGiveawayMessage(giveaway.giveawayId, message.id);
    await interaction.editReply({
      content: t("commands.giveaway.subcommands.simple.success", { id: giveaway.giveawayId })
    });
  } catch (error) {
    logger.error("Error creating simple giveaway:", error);
    await interaction.editReply({
      content: t("commands.giveaway.error")
    });
  }
}
async function handleEnd(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const giveawayId = interaction.options.getString("giveaway_id", true);
  try {
    const result = await giveawayService.endGiveaway(giveawayId, interaction.user);
    if (!result.success) {
      return interaction.editReply({
        content: result.error ? t(result.error, { defaultValue: result.error }) : t("commands.giveaway.error")
      });
    }
    await interaction.editReply({
      content: t("commands.giveaway.subcommands.end.success", {
        count: result.winners?.length || 0,
        id: giveawayId
      })
    });
  } catch (error) {
    logger.error("Error ending giveaway:", error);
    await interaction.editReply({
      content: t("commands.giveaway.error")
    });
  }
}
async function handleReroll(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const giveawayId = interaction.options.getString("giveaway_id", true);
  const newWinnerCount = interaction.options.getInteger("winners");
  try {
    const result = await giveawayService.rerollGiveaway(
      giveawayId,
      interaction.user,
      newWinnerCount || void 0
    );
    if (!result.success) {
      return interaction.editReply({
        content: result.error ? t(result.error, { defaultValue: result.error }) : t("commands.giveaway.error")
      });
    }
    await interaction.editReply({
      content: t("commands.giveaway.subcommands.reroll.success", {
        count: result.winners?.length || 0,
        id: giveawayId
      })
    });
  } catch (error) {
    logger.error("Error rerolling giveaway:", error);
    await interaction.editReply({
      content: t("commands.giveaway.error")
    });
  }
}
async function handleConfigure(interaction) {
  const giveawayId = interaction.options.getString("giveaway_id", true);
  const embedTitle = interaction.options.getString("embed_title");
  const embedImage = interaction.options.getAttachment("embed_image")?.url;
  const embedThumbnail = interaction.options.getAttachment("embed_thumbnail")?.url;
  const giveaway = await giveawayService.getGiveaway(giveawayId);
  if (!giveaway || giveaway.guildId !== interaction.guild.id) {
    return interaction.reply({
      content: t("commands.giveaway.notFound"),
      ephemeral: true
    });
  }
  if (giveaway.status !== "active") {
    return interaction.reply({
      content: t("commands.giveaway.notActive"),
      ephemeral: true
    });
  }
  if (embedTitle || embedImage || embedThumbnail) {
    giveawayService.startCommandEmbedCache.set(interaction.user.id, {
      embedTitle,
      embedImage,
      embedThumbnail
    });
  }
  const modal = new ModalBuilder().setCustomId(`gw_configure:${giveawayId}`).setTitle(t("commands.giveaway.subcommands.configure.modal.title"));
  const prizeInput = new TextInputBuilder().setCustomId("prize").setLabel(t("commands.giveaway.subcommands.configure.modal.prize")).setStyle(TextInputStyle.Short).setValue(giveaway.prize).setRequired(true).setMaxLength(255);
  const winnersInput = new TextInputBuilder().setCustomId("winners").setLabel(t("commands.giveaway.subcommands.configure.modal.winners")).setStyle(TextInputStyle.Short).setValue(giveaway.winnerCount.toString()).setRequired(true);
  const descriptionInput = new TextInputBuilder().setCustomId("description").setLabel(t("commands.giveaway.subcommands.configure.modal.description")).setStyle(TextInputStyle.Paragraph).setValue(giveaway.description || "").setRequired(false).setMaxLength(1e3);
  const requirementsInput = new TextInputBuilder().setCustomId("requirements").setLabel(t("commands.giveaway.subcommands.configure.modal.requirements")).setStyle(TextInputStyle.Paragraph).setValue(formatRequirements(giveaway.requirements)).setRequired(false).setMaxLength(500);
  const bonusEntriesInput = new TextInputBuilder().setCustomId("bonusEntries").setLabel(t("commands.giveaway.subcommands.configure.modal.bonusEntries")).setStyle(TextInputStyle.Paragraph).setValue(formatBonusEntries(giveaway.bonusEntries)).setRequired(false).setMaxLength(500);
  const rows = [
    new ActionRowBuilder().addComponents(prizeInput),
    new ActionRowBuilder().addComponents(winnersInput),
    new ActionRowBuilder().addComponents(descriptionInput),
    new ActionRowBuilder().addComponents(requirementsInput),
    new ActionRowBuilder().addComponents(bonusEntriesInput)
  ];
  modal.addComponents(...rows);
  return interaction.showModal(modal);
}
function parseDuration(duration) {
  const regex = /^(\d+)([smhd])$/i;
  const match = duration.match(regex);
  if (!match) return null;
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  switch (unit) {
    case "s":
      return value * 1e3;
    case "m":
      return value * 60 * 1e3;
    case "h":
      return value * 60 * 60 * 1e3;
    case "d":
      return value * 24 * 60 * 60 * 1e3;
    default:
      return null;
  }
}
function formatRequirements(requirements) {
  const lines = [];
  if (requirements.roleIds?.length > 0) {
    requirements.roleIds.forEach((id) => lines.push(`role:${id}`));
  }
  if (requirements.minLevel) {
    lines.push(`level:${requirements.minLevel}`);
  }
  if (requirements.minTimeInServer) {
    lines.push(`time:${requirements.minTimeInServer}`);
  }
  return lines.join("\n");
}
function formatBonusEntries(bonusEntries) {
  const lines = [];
  if (bonusEntries.roles) {
    Object.entries(bonusEntries.roles).forEach(([id, multiplier]) => {
      lines.push(`role:${id}:${multiplier}`);
    });
  }
  if (bonusEntries.booster) {
    lines.push(`booster:${bonusEntries.booster}`);
  }
  return lines.join("\n");
}
