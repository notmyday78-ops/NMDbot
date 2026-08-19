"use strict";
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { CommandCategory } from "../../types/command";
import { economyService } from "../../services/economyService";
import { economyRepository } from "../../repositories/economyRepository";
import { embedBuilder } from "../../handlers/embedBuilder";
import { logger } from "../../utils/logger";
import { getGuildLocale } from "../../i18n";
import { getDatabase } from "../../database/connection";
import { economyCooldowns } from "../../database/schema/economy";
import { and, eq } from "drizzle-orm";
export const isSubcommand = false;
export const data = new SlashCommandBuilder().setName("vote").setDescription("Vote for Pegasus to get a 1.2x XP multiplier (24h) and 3000-6000 Coins!");
export const category = CommandCategory.Economy;
export const cooldown = 3;
export async function execute(interaction) {
  await interaction.deferReply();
  const userId = interaction.user.id;
  const guildId = interaction.guildId;
  const locale = getGuildLocale(interaction.guildId);
  try {
    const db = getDatabase();
    const [cooldownRecord] = await db.select().from(economyCooldowns).where(
      and(
        eq(economyCooldowns.userId, userId),
        eq(economyCooldowns.guildId, "global"),
        eq(economyCooldowns.commandType, "vote")
      )
    ).limit(1);
    if (cooldownRecord && cooldownRecord.nextAvailable.getTime() > Date.now()) {
      const timeLeft = cooldownRecord.nextAvailable.getTime() - Date.now();
      const hours = Math.floor(timeLeft / 1e3 / 60 / 60);
      const minutes = Math.floor(timeLeft / 1e3 / 60 % 60);
      await interaction.editReply({
        embeds: [embedBuilder.createErrorEmbed(`You can vote again in ${hours}h ${minutes}m! Vote at: https://top.gg/bot/1375140177961418774`)]
      });
      return;
    }
    if (process.env.TOPGG_TOKEN) {
      try {
        const response = await fetch(`https://top.gg/api/bots/1375140177961418774/check?userId=${userId}`, {
          headers: {
            Authorization: process.env.TOPGG_TOKEN
          }
        });
        if (response.ok) {
          const data2 = await response.json();
          if (data2.voted === 0) {
            await interaction.editReply({
              embeds: [
                embedBuilder.createErrorEmbed(
                  "You haven't voted yet! Please [click here to vote on Top.gg](https://top.gg/bot/1375140177961418774), then run `/vote` again to claim your rewards!"
                )
              ]
            });
            return;
          }
        } else {
          logger.warn(`Top.gg API returned status ${response.status}`);
        }
      } catch (error) {
        logger.error("Failed to check Top.gg API:", error);
      }
    }
    const amount = Math.floor(Math.random() * (6e3 - 3e3 + 1) + 3e3);
    const result = await economyService.addMoney(
      userId,
      guildId,
      amount,
      "vote",
      "Voted on Top.gg"
    );
    if (!result.success) {
      await interaction.editReply({
        embeds: [embedBuilder.createErrorEmbed(result.error || "Failed to claim vote reward.")]
      });
      return;
    }
    const now = /* @__PURE__ */ new Date();
    const nextAvailable = new Date(now.getTime() + 12 * 60 * 60 * 1e3);
    await db.insert(economyCooldowns).values({
      userId,
      guildId: "global",
      commandType: "vote",
      lastUsed: now,
      nextAvailable,
      streakDays: 0
    }).onConflictDoUpdate({
      target: [economyCooldowns.userId, economyCooldowns.guildId, economyCooldowns.commandType],
      set: {
        lastUsed: now,
        nextAvailable
      }
    });
    const settings = await economyRepository.ensureSettings(guildId);
    const embed = new EmbedBuilder().setTitle("Thank you for voting! \u2764\uFE0F").setDescription(`You voted for Pegasus and received your rewards!

**Rewards:**
- \u{1F4B0} ${settings.currencySymbol} **${amount.toLocaleString()}**
- \u2728 **1.2x XP Multiplier** for 24 hours globally!

[Vote again in 12 hours!](https://top.gg/bot/1375140177961418774)`).setColor(3066993).setThumbnail(interaction.user.displayAvatarURL()).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("Error in vote command:", error);
    await interaction.editReply({
      embeds: [embedBuilder.createErrorEmbed("Failed to claim vote reward. Please try again later.")]
    });
  }
}
