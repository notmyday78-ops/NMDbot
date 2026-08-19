"use strict";
import { EmbedBuilder } from "discord.js";
import { xpService } from "../../services/xpService";
import { rankCardService } from "../../services/rankCardService";
import { logger } from "../../utils/logger";
import { getTranslation } from "../../i18n";
export async function handleXPModals(interaction) {
  if (interaction.customId !== "xp_card_customization") return;
  const locale = await getTranslation(interaction.guildId, interaction.user.id);
  try {
    await interaction.deferReply({ ephemeral: true });
    const backgroundColor = interaction.fields.getTextInputValue("backgroundColor") || "#23272A";
    const progressBarColor = interaction.fields.getTextInputValue("progressBarColor") || "#5865F2";
    const textColor = interaction.fields.getTextInputValue("textColor") || "#FFFFFF";
    const accentColor = interaction.fields.getTextInputValue("accentColor") || "#EB459E";
    const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
    const colors = { backgroundColor, progressBarColor, textColor, accentColor };
    for (const [name, value] of Object.entries(colors)) {
      if (!hexColorRegex.test(value)) {
        const colorLabel = locale.commands.xp.card[name] || name;
        const embed2 = new EmbedBuilder().setColor(16711680).setDescription(
          locale.commands.xp.card.invalidColor.replace("{{color}}", colorLabel).replace("{{value}}", value)
        );
        await interaction.editReply({ embeds: [embed2] });
        return;
      }
    }
    const customization = {
      backgroundColor,
      progressBarColor,
      textColor,
      accentColor
    };
    const success = await xpService.saveRankCardCustomization(interaction.user.id, customization);
    if (!success) {
      const embed2 = new EmbedBuilder().setColor(16711680).setDescription(locale.common.error);
      await interaction.editReply({ embeds: [embed2] });
      return;
    }
    const rankData = await xpService.getUserRank(interaction.user.id, interaction.guildId);
    if (!rankData) {
      const embed2 = new EmbedBuilder().setColor(65280).setDescription(locale.commands.xp.card.savedNoPreview);
      await interaction.editReply({ embeds: [embed2] });
      return;
    }
    rankData.avatarUrl = interaction.user.displayAvatarURL({ extension: "png", size: 256 });
    rankData.username = interaction.user.username;
    const rankCard = await rankCardService.generateRankCard(rankData, customization);
    if (!rankCard) {
      const embed2 = new EmbedBuilder().setColor(65280).setDescription(locale.commands.xp.card.savedNoPreview);
      await interaction.editReply({ embeds: [embed2] });
      return;
    }
    const embed = new EmbedBuilder().setColor(65280).setTitle(locale.commands.xp.card.savedTitle).setDescription(locale.commands.xp.card.savedDescription).addFields(
      {
        name: locale.commands.xp.card.backgroundColor,
        value: backgroundColor,
        inline: true
      },
      {
        name: locale.commands.xp.card.progressBarColor,
        value: progressBarColor,
        inline: true
      },
      {
        name: locale.commands.xp.card.textColor,
        value: textColor,
        inline: true
      },
      {
        name: locale.commands.xp.card.accentColor,
        value: accentColor,
        inline: true
      }
    );
    await interaction.editReply({ embeds: [embed], files: [rankCard] });
  } catch (error) {
    logger.error("Failed to handle XP card customization modal:", error);
    const embed = new EmbedBuilder().setColor(16711680).setDescription(locale.common.error);
    if (interaction.deferred) {
      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
}
