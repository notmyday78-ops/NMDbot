"use strict";
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder } from "discord.js";
import { giveawayService } from "../../services/giveawayService";
import { giveawayRepository } from "../../repositories/giveawayRepository";
import { t } from "../../i18n";
export async function handleGiveawayButtons(interaction) {
  const [action, giveawayId] = interaction.customId.split(":");
  switch (action) {
    case "gw_enter":
      return handleGiveawayEnter(interaction, giveawayId);
    case "gw_info":
      return handleGiveawayInfo(interaction, giveawayId);
  }
}
async function handleGiveawayEnter(interaction, giveawayId) {
  await interaction.deferReply({ ephemeral: true });
  const existingEntry = await giveawayRepository.getUserEntry(giveawayId, interaction.user.id);
  if (existingEntry) {
    const result = await giveawayService.removeEntry(giveawayId, interaction.user.id);
    if (result.success) {
      await interaction.editReply({
        content: t("commands.giveaway.interactions.left")
      });
    } else {
      await interaction.editReply({
        content: result.error || t("commands.giveaway.error")
      });
    }
  } else {
    const result = await giveawayService.enterGiveaway(
      giveawayId,
      interaction.user.id,
      interaction.guild
    );
    if (result.success) {
      await interaction.editReply({
        content: t("commands.giveaway.interactions.entered", { entries: result.entries })
      });
    } else {
      await interaction.editReply({
        content: result.error || t("commands.giveaway.error")
      });
    }
  }
  await updateButtonCount(interaction, giveawayId);
}
async function handleGiveawayInfo(interaction, giveawayId) {
  await interaction.deferReply({ ephemeral: true });
  const giveaway = await giveawayRepository.getGiveaway(giveawayId);
  if (!giveaway) {
    await interaction.editReply({
      content: t("commands.giveaway.notFound")
    });
    return;
  }
  const userEntry = await giveawayRepository.getUserEntry(giveawayId, interaction.user.id);
  const stats = await giveawayRepository.getUserGiveawayStats(interaction.user.id);
  const embed = new EmbedBuilder().setColor(39423).setTitle(t("commands.giveaway.info.title")).setDescription(t("commands.giveaway.info.description", { prize: giveaway.prize })).addFields(
    {
      name: t("commands.giveaway.info.status"),
      value: giveaway.status === "active" ? t("commands.giveaway.info.statusActive") : t("commands.giveaway.info.statusEnded"),
      inline: true
    },
    {
      name: t("commands.giveaway.info.entries"),
      value: giveaway.entries.toString(),
      inline: true
    },
    {
      name: t("commands.giveaway.info.winners"),
      value: giveaway.winnerCount.toString(),
      inline: true
    },
    {
      name: t("commands.giveaway.info.yourEntries"),
      value: userEntry ? userEntry.entries.toString() : "0",
      inline: true
    },
    {
      name: t("commands.giveaway.info.yourStats"),
      value: t("commands.giveaway.info.statsValue", {
        entries: stats.totalEntries,
        wins: stats.totalWins
      }),
      inline: true
    }
  ).setFooter({
    text: t("commands.giveaway.info.footer", { id: giveaway.giveawayId })
  }).setTimestamp();
  if (giveaway.description) {
    embed.setDescription(giveaway.description);
  }
  if (giveaway.requirements && Object.keys(giveaway.requirements).length > 0) {
    const reqLines = [];
    const requirements = giveaway.requirements;
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
    if (reqLines.length > 0) {
      embed.addFields({
        name: t("commands.giveaway.info.requirements"),
        value: reqLines.join("\n"),
        inline: false
      });
    }
  }
  if (giveaway.bonusEntries && Object.keys(giveaway.bonusEntries).length > 0) {
    const bonusLines = [];
    const bonusEntries = giveaway.bonusEntries;
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
    if (bonusLines.length > 0) {
      embed.addFields({
        name: t("commands.giveaway.info.bonusEntries"),
        value: bonusLines.join("\n"),
        inline: false
      });
    }
  }
  await interaction.editReply({ embeds: [embed] });
}
async function updateButtonCount(interaction, giveawayId) {
  try {
    const giveaway = await giveawayRepository.getGiveaway(giveawayId);
    if (!giveaway || !giveaway.messageId) return;
    const message = interaction.message;
    if (!message.editable) return;
    if (message.components && message.components[0]) {
      const actionRow = message.components[0];
      if ("components" in actionRow) {
        const components = actionRow.components;
        const enterButtonIndex = components.findIndex(
          (c) => "custom_id" in c && typeof c.custom_id === "string" && c.custom_id.startsWith("gw_enter:")
        );
        if (enterButtonIndex !== -1) {
          const enterButton = components[enterButtonIndex];
          if ("custom_id" in enterButton && "style" in enterButton) {
            const newButton = new ButtonBuilder().setCustomId(enterButton.custom_id).setLabel(`${t("commands.giveaway.buttons.enter")} (${giveaway.entries})`).setStyle(enterButton.style || 1);
            const row = new ActionRowBuilder();
            components.forEach((c, i) => {
              if (i === enterButtonIndex) {
                row.addComponents(newButton);
              } else if ("custom_id" in c && "label" in c && "style" in c) {
                row.addComponents(
                  new ButtonBuilder().setCustomId(c.custom_id).setLabel(c.label || "").setStyle(c.style || 1)
                );
              }
            });
            await message.edit({ components: [row] });
          }
        }
      }
    }
  } catch (error) {
  }
}
