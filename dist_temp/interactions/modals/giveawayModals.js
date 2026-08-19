"use strict";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from "discord.js";
import { giveawayService } from "../../services/giveawayService";
import { t } from "../../i18n";
export async function handleGiveawayModals(interaction) {
  const [action, ...params] = interaction.customId.split(":");
  if (action === "gw_start") {
    return handleGiveawayStart(interaction, params);
  } else if (action === "gw_configure") {
    return handleGiveawayConfigure(interaction, params[0]);
  }
}
async function handleGiveawayStart(interaction, params) {
  await interaction.deferReply({ ephemeral: true });
  const [channelId, prize, durationMs, winners] = params;
  const channel = interaction.guild.channels.cache.get(channelId);
  if (!channel) {
    await interaction.editReply({
      content: t("commands.giveaway.error")
    });
    return;
  }
  const description = interaction.fields.getTextInputValue("description") || null;
  const requirementsText = interaction.fields.getTextInputValue("requirements");
  const bonusEntriesText = interaction.fields.getTextInputValue("bonusEntries");
  const embedColorText = interaction.fields.getTextInputValue("embedColor");
  const hostText = interaction.fields.getTextInputValue("host");
  const requirements = {};
  if (requirementsText) {
    const lines = requirementsText.split("\n").filter((line) => line.trim());
    for (const line of lines) {
      const [key, value] = line.split(":").map((s) => s.trim());
      if (key === "role") {
        if (!requirements.roleIds) requirements.roleIds = [];
        requirements.roleIds.push(value);
      } else if (key === "level") {
        requirements.minLevel = parseInt(value);
      } else if (key === "time") {
        requirements.minTimeInServer = value;
      }
    }
  }
  const bonusEntries = {};
  if (bonusEntriesText) {
    const lines = bonusEntriesText.split("\n").filter((line) => line.trim());
    for (const line of lines) {
      const parts = line.split(":").map((s) => s.trim());
      if (parts[0] === "role" && parts.length === 3) {
        if (!bonusEntries.roles) bonusEntries.roles = {};
        bonusEntries.roles[parts[1]] = parseInt(parts[2]);
      } else if (parts[0] === "booster" && parts.length === 2) {
        bonusEntries.booster = parseInt(parts[1]);
      }
    }
  }
  let embedColor = 39423;
  if (embedColorText) {
    const colorMatch = embedColorText.match(/^#?([0-9A-Fa-f]{6})$/);
    if (colorMatch) {
      embedColor = parseInt(colorMatch[1], 16);
    }
  }
  let hostedBy = interaction.user.id;
  let hostDisplay = `<@${interaction.user.id}>`;
  if (hostText) {
    if (hostText.startsWith("<@") && hostText.endsWith(">")) {
      hostedBy = hostText.slice(2, -1).replace("!", "");
      hostDisplay = hostText;
    } else {
      hostDisplay = hostText;
    }
  }
  try {
    const cachedEmbed = giveawayService.startCommandEmbedCache.get(interaction.user.id);
    if (cachedEmbed) {
      giveawayService.startCommandEmbedCache.delete(interaction.user.id);
    }
    const giveaway = await giveawayService.createGiveaway({
      guildId: interaction.guild.id,
      channelId: channel.id,
      hostedBy,
      prize,
      winnerCount: parseInt(winners),
      endTime: new Date(Date.now() + parseInt(durationMs)),
      description,
      requirements,
      bonusEntries,
      embedColor,
      embedTitle: cachedEmbed?.embedTitle,
      embedImage: cachedEmbed?.embedImage,
      embedThumbnail: cachedEmbed?.embedThumbnail
    });
    const embed = new EmbedBuilder().setColor(embedColor).setTitle(cachedEmbed?.embedTitle || t("commands.giveaway.embed.title")).setDescription(description || t("commands.giveaway.embed.description", { prize })).addFields(
      {
        name: t("commands.giveaway.embed.hostedBy"),
        value: hostDisplay,
        inline: true
      },
      {
        name: t("commands.giveaway.embed.winners"),
        value: winners,
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
    if (cachedEmbed?.embedImage) embed.setImage(cachedEmbed.embedImage);
    if (cachedEmbed?.embedThumbnail) embed.setThumbnail(cachedEmbed.embedThumbnail);
    if (Object.keys(requirements).length > 0) {
      const reqLines = [];
      if (requirements.roleIds?.length > 0) {
        reqLines.push(
          `\u2022 ${t("commands.config.subcommands.xp.buttons.roles")}: ${requirements.roleIds.map((id) => `<@&${id}>`).join(", ")}`
        );
      }
      if (requirements.minLevel) {
        reqLines.push(
          `\u2022 ${t("commands.warn.subcommands.issue.success.level")}: ${requirements.minLevel}`
        );
      }
      if (requirements.minTimeInServer) {
        reqLines.push(
          `\u2022 ${t("commands.moderation.subcommands.mute.success.duration")}: ${requirements.minTimeInServer}`
        );
      }
      embed.addFields({
        name: t("commands.giveaway.embed.requirements"),
        value: reqLines.join("\n"),
        inline: false
      });
    }
    if (Object.keys(bonusEntries).length > 0) {
      const bonusLines = [];
      if (bonusEntries.roles) {
        for (const [roleId, multiplier] of Object.entries(bonusEntries.roles)) {
          bonusLines.push(`\u2022 <@&${roleId}>: ${multiplier}x ${t("commands.giveaway.info.entries")}`);
        }
      }
      if (bonusEntries.booster) {
        bonusLines.push(
          `\u2022 ${t("commands.config.subcommands.xp.embed.fields.boosterRole")}: ${bonusEntries.booster}x ${t("commands.giveaway.info.entries")}`
        );
      }
      embed.addFields({
        name: t("commands.giveaway.embed.bonusEntries"),
        value: bonusLines.join("\n"),
        inline: false
      });
    }
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
      content: t("commands.giveaway.subcommands.start.success", { id: giveaway.giveawayId })
    });
  } catch (error) {
    console.error("Error creating giveaway:", error);
    await interaction.editReply({
      content: t("commands.giveaway.error")
    });
  }
}
async function handleGiveawayConfigure(interaction, giveawayId) {
  await interaction.deferReply({ ephemeral: true });
  const prize = interaction.fields.getTextInputValue("prize");
  const winners = parseInt(interaction.fields.getTextInputValue("winners"));
  const description = interaction.fields.getTextInputValue("description") || null;
  const requirementsText = interaction.fields.getTextInputValue("requirements");
  const bonusEntriesText = interaction.fields.getTextInputValue("bonusEntries");
  if (isNaN(winners) || winners < 1 || winners > 20) {
    await interaction.editReply({
      content: t("common.error")
    });
    return;
  }
  const requirements = {};
  if (requirementsText) {
    const lines = requirementsText.split("\n").filter((line) => line.trim());
    for (const line of lines) {
      const [key, value] = line.split(":").map((s) => s.trim());
      if (key === "role") {
        if (!requirements.roleIds) requirements.roleIds = [];
        requirements.roleIds.push(value);
      } else if (key === "level") {
        requirements.minLevel = parseInt(value);
      } else if (key === "time") {
        requirements.minTimeInServer = value;
      }
    }
  }
  const bonusEntries = {};
  if (bonusEntriesText) {
    const lines = bonusEntriesText.split("\n").filter((line) => line.trim());
    for (const line of lines) {
      const parts = line.split(":").map((s) => s.trim());
      if (parts[0] === "role" && parts.length === 3) {
        if (!bonusEntries.roles) bonusEntries.roles = {};
        bonusEntries.roles[parts[1]] = parseInt(parts[2]);
      } else if (parts[0] === "booster" && parts.length === 2) {
        bonusEntries.booster = parseInt(parts[1]);
      }
    }
  }
  try {
    const cachedEmbed = giveawayService.startCommandEmbedCache.get(interaction.user.id);
    if (cachedEmbed) {
      giveawayService.startCommandEmbedCache.delete(interaction.user.id);
    }
    await giveawayService.updateGiveaway(
      giveawayId,
      {
        prize,
        winnerCount: winners,
        description,
        requirements,
        bonusEntries,
        ...cachedEmbed?.embedTitle !== void 0 ? { embedTitle: cachedEmbed.embedTitle } : {},
        ...cachedEmbed?.embedImage !== void 0 ? { embedImage: cachedEmbed.embedImage } : {},
        ...cachedEmbed?.embedThumbnail !== void 0 ? { embedThumbnail: cachedEmbed.embedThumbnail } : {}
      },
      interaction.user
    );
    await interaction.editReply({
      content: t("commands.giveaway.subcommands.configure.success", { id: giveawayId })
    });
  } catch (error) {
    console.error("Error configuring giveaway:", error);
    await interaction.editReply({
      content: t("commands.giveaway.error")
    });
  }
}
