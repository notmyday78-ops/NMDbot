"use strict";
import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags
} from "discord.js";
import { CommandCategory } from "../../types/command";
import { t } from "../../i18n";
import { engagementRepository } from "../../repositories/engagementRepository";
export const data = new SlashCommandBuilder().setName("achievements").setDescription("View your unlocked and available achievements");
export const category = CommandCategory.XP;
export const cooldown = 3;
export async function execute(interaction) {
  if (!interaction.guild) {
    await interaction.reply({ content: t("common.guildOnly"), flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply();
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const allAchievements = await engagementRepository.listAchievements(guildId);
  const userUnlocked = await engagementRepository.getUserAchievements(guildId, userId);
  const unlockedIds = new Set(userUnlocked.map((a) => a.achievementId));
  const embed = new EmbedBuilder().setColor(5793266).setTitle(`\u{1F3C6} Achievements for ${interaction.user.username}`).setThumbnail(interaction.user.displayAvatarURL());
  if (allAchievements.length === 0) {
    embed.setDescription("No achievements have been configured for this server yet.");
  } else {
    const list = allAchievements.map((a) => {
      const isUnlocked = unlockedIds.has(a.id);
      const emoji = isUnlocked ? "\u2705" : "\u{1F512}";
      return `${emoji} **${a.title}**
  ${a.description}
  Rewards: ${a.rewardXp} XP | ${a.rewardCoins} Coins`;
    });
    let description = "";
    let count = 0;
    for (const item of list) {
      if (description.length + item.length + 2 > 4e3) {
        description += `

...and ${list.length - count} more achievements.`;
        break;
      }
      description += (description.length > 0 ? "\n\n" : "") + item;
      count++;
    }
    embed.setDescription(description);
  }
  await interaction.editReply({ embeds: [embed] });
}
