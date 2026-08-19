"use strict";
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { CommandCategory } from "../../types/command";
import { t } from "../../i18n";
import { engagementRepository } from "../../repositories/engagementRepository";
export const data = new SlashCommandBuilder().setName("quests").setDescription("View active engagement quests and your progress");
export const category = CommandCategory.XP;
export const cooldown = 3;
export async function execute(interaction) {
  if (!interaction.guild) {
    await interaction.reply({ content: t("common.guildOnly"), ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: false });
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const activeQuests = await engagementRepository.getActiveQuests(guildId);
  const embed = new EmbedBuilder().setColor(5793266).setTitle(`\u{1F4DC} Active Quests for ${interaction.user.username}`).setThumbnail(interaction.user.displayAvatarURL());
  if (activeQuests.length === 0) {
    embed.setDescription("No active quests available at the moment. Check back later!");
  } else {
    const list = [];
    for (const q of activeQuests) {
      const progressObj = await engagementRepository.getUserQuestProgress(guildId, userId, q.id);
      const current = progressObj?.progress || 0;
      const isCompleted = progressObj?.completed || false;
      const status = isCompleted ? "\u2705 Completed" : `\u23F3 Progress: ${current} / ${q.targetValue}`;
      list.push(
        `**${q.title}** (${status})
  ${q.description}
  Rewards: ${q.rewardXp} XP | ${q.rewardCoins} Coins`
      );
    }
    embed.setDescription(list.join("\n\n"));
  }
  await interaction.editReply({ embeds: [embed] });
}
