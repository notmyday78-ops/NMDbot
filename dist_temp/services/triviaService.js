"use strict";
import { client } from "../index";
import { getDatabase } from "../database/connection";
import { triviaGames } from "../database/schema";
import { eq, and, lte } from "drizzle-orm";
import { logger } from "../utils/logger";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} from "discord.js";
import { xpService } from "./xpService";
import { economyService } from "./economyService";
class TriviaService {
  async checkScheduledGames() {
    try {
      const db = getDatabase();
      const now = /* @__PURE__ */ new Date();
      const dueGames = await db.select().from(triviaGames).where(and(eq(triviaGames.status, "scheduled"), lte(triviaGames.scheduledAt, now)));
      for (const game of dueGames) {
        await this.startGame(game.id);
      }
    } catch (error) {
      logger.error("Error checking scheduled trivia games:", error);
    }
  }
  async startGame(gameId) {
    try {
      const db = getDatabase();
      const [game] = await db.select().from(triviaGames).where(eq(triviaGames.id, gameId));
      if (!game) return;
      if (!client.guilds.cache.has(game.guildId)) return;
      await db.update(triviaGames).set({ status: "active" }).where(eq(triviaGames.id, gameId));
      const channel = await client.channels.fetch(game.channelId).catch(() => null);
      if (!channel || !channel.isTextBased()) {
        await db.update(triviaGames).set({ status: "cancelled" }).where(eq(triviaGames.id, gameId));
        return;
      }
      const questions = game.questions;
      if (!questions || questions.length === 0) {
        await db.update(triviaGames).set({ status: "cancelled" }).where(eq(triviaGames.id, gameId));
        return;
      }
      const scores = {};
      const askQuestion = async (qIndex) => {
        if (qIndex >= questions.length) {
          let topWinnerId = null;
          let maxScore = 0;
          for (const [uid, score] of Object.entries(scores)) {
            if (score > maxScore) {
              maxScore = score;
              topWinnerId = uid;
            }
          }
          await db.update(triviaGames).set({
            status: "completed",
            winnerId: topWinnerId
          }).where(eq(triviaGames.id, gameId));
          const overEmbed = new EmbedBuilder().setTitle("\u{1F9E0} Trivia Game Over!").setColor(9647082);
          if (topWinnerId) {
            overEmbed.setDescription(
              `The overall winner is <@${topWinnerId}> with ${maxScore} correct answer(s)!
They received all the rewards accumulated!`
            );
            const totalXp = game.rewardXp * maxScore;
            const totalCoins = game.rewardCoins * maxScore;
            const guildMember = await channel.guild.members.fetch(topWinnerId).catch(() => null);
            if (guildMember) {
              if (totalXp > 0) {
                await xpService.addXP(
                  topWinnerId,
                  game.guildId,
                  guildMember,
                  totalXp,
                  channel.id
                );
              }
              if (totalCoins > 0) {
                await economyService.addMoney(
                  topWinnerId,
                  game.guildId,
                  totalCoins,
                  "wallet",
                  "Trivia Win"
                );
              }
            }
          } else {
            overEmbed.setDescription("Nobody scored any points!");
          }
          await channel.send({ embeds: [overEmbed] });
          return;
        }
        const q = questions[qIndex];
        const embed = new EmbedBuilder().setTitle(`\u{1F9E0} Trivia Time! (Question ${qIndex + 1} of ${questions.length})`).setDescription(`**${q.question}**

You have 30 seconds to answer!`).setColor(9647082).addFields({
          name: "Rewards Per Question",
          value: `\u2B50 ${game.rewardXp} XP | \u{1F4B0} ${game.rewardCoins} Coins`
        });
        const row = new ActionRowBuilder();
        q.options.forEach((opt, idx) => {
          row.addComponents(
            new ButtonBuilder().setCustomId(`trivia_${game.id}_${qIndex}_${idx}`).setLabel(opt).setStyle(ButtonStyle.Primary)
          );
        });
        const message = await channel.send({ embeds: [embed], components: [row] });
        const collector = message.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 3e4,
          filter: (i) => i.customId.startsWith(`trivia_${game.id}_${qIndex}`)
        });
        let winnerId = null;
        collector.on("collect", async (i) => {
          if (winnerId) {
            await i.reply({ content: "Someone already answered correctly!", ephemeral: true });
            return;
          }
          const answerIdx = parseInt(i.customId.split("_")[3]);
          if (answerIdx === q.correctIndex) {
            winnerId = i.user.id;
            scores[winnerId] = (scores[winnerId] || 0) + 1;
            await i.reply({ content: `\u{1F389} Correct! You scored a point!` });
            collector.stop("winner");
          } else {
            await i.reply({ content: "\u274C Incorrect answer!", ephemeral: true });
          }
        });
        collector.on("end", async (collected, reason) => {
          const disabledRow = new ActionRowBuilder();
          q.options.forEach((opt, idx) => {
            disabledRow.addComponents(
              new ButtonBuilder().setCustomId(`trivia_${game.id}_${qIndex}_${idx}_disabled`).setLabel(opt).setStyle(
                winnerId !== null && idx === q.correctIndex ? ButtonStyle.Success : ButtonStyle.Secondary
              ).setDisabled(true)
            );
          });
          const endEmbed = new EmbedBuilder().setTitle(`\u{1F9E0} Trivia (Question ${qIndex + 1}) Ended`).setDescription(
            `**${q.question}**

The correct answer was: **${q.options[q.correctIndex]}**`
          ).setColor(winnerId ? 2278750 : 15680580);
          if (winnerId) {
            endEmbed.addFields({ name: "Winner", value: `<@${winnerId}>` });
          } else {
            endEmbed.addFields({ name: "Result", value: "Nobody answered correctly in time!" });
          }
          await message.edit({ embeds: [endEmbed], components: [disabledRow] });
          setTimeout(() => askQuestion(qIndex + 1), 3e3);
        });
      };
      await askQuestion(0);
    } catch (error) {
      logger.error(`Error starting trivia game ${gameId}:`, error);
    }
  }
}
export const triviaService = new TriviaService();
