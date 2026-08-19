"use strict";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from "discord.js";
import { giveawayRepository } from "../repositories/giveawayRepository";
import { auditLogger } from "../security/audit";
import { t } from "../i18n";
import { logger } from "../utils/logger";
import { generateId } from "../utils/id";
import { xpRepository } from "../repositories/xpRepository";
export class GiveawayService {
  activeTimers = /* @__PURE__ */ new Map();
  startCommandEmbedCache = /* @__PURE__ */ new Map();
  async createGiveaway(data) {
    const giveawayId = `GW${generateId(10)}`;
    const isScheduled = data.startTime && data.startTime > /* @__PURE__ */ new Date();
    const giveaway = await giveawayRepository.createGiveaway({
      giveawayId,
      ...data,
      status: isScheduled ? "scheduled" : "active",
      requirements: data.requirements,
      bonusEntries: data.bonusEntries
    });
    if (!isScheduled) {
      this.scheduleGiveawayEnd({
        giveawayId: giveaway.giveawayId,
        endTime: giveaway.endTime,
        status: giveaway.status
      });
    }
    await auditLogger.logAction({
      action: "GIVEAWAY_CREATE",
      userId: data.hostedBy,
      guildId: data.guildId,
      details: {
        giveawayId: giveaway.giveawayId,
        prize: data.prize,
        winnerCount: data.winnerCount,
        endTime: data.endTime
      }
    });
    return giveaway;
  }
  async updateGiveawayMessage(giveawayId, messageId) {
    await giveawayRepository.updateGiveaway(giveawayId, { messageId });
  }
  async getGiveaway(giveawayId) {
    return giveawayRepository.getGiveaway(giveawayId);
  }
  async enterGiveaway(giveawayId, userId, guild) {
    const giveaway = await giveawayRepository.getGiveaway(giveawayId);
    if (!giveaway) {
      return { success: false, error: t("commands.giveaway.notFound") };
    }
    if (giveaway.status !== "active") {
      return { success: false, error: t("commands.giveaway.notActive") };
    }
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) {
      return { success: false, error: t("common.invalidUser") };
    }
    const requirementCheck = await this.checkRequirements(
      member,
      giveaway.requirements
    );
    if (!requirementCheck.met) {
      return { success: false, error: requirementCheck.reason };
    }
    const bonusMultiplier = this.calculateBonusEntries(
      member,
      giveaway.bonusEntries
    );
    const totalEntries = 1 * bonusMultiplier;
    await giveawayRepository.addEntry(giveawayId, userId, totalEntries);
    return { success: true, entries: totalEntries };
  }
  async removeEntry(giveawayId, userId) {
    const giveaway = await giveawayRepository.getGiveaway(giveawayId);
    if (!giveaway) {
      return { success: false, error: t("commands.giveaway.notFound") };
    }
    if (giveaway.status !== "active") {
      return { success: false, error: t("commands.giveaway.notActive") };
    }
    await giveawayRepository.removeEntry(giveawayId, userId);
    return { success: true };
  }
  async endGiveaway(giveawayId, endedBy) {
    const giveaway = await giveawayRepository.getGiveaway(giveawayId);
    if (!giveaway) {
      return { success: false, error: t("commands.giveaway.notFound") };
    }
    if (giveaway.status !== "active") {
      return { success: false, error: t("commands.giveaway.notActive") };
    }
    const entries = await giveawayRepository.getEntries(giveawayId);
    const winners = this.selectWinners(entries, giveaway.winnerCount);
    await giveawayRepository.updateGiveaway(giveawayId, {
      status: "ended",
      winners,
      endedAt: /* @__PURE__ */ new Date()
    });
    const timer = this.activeTimers.get(giveawayId);
    if (timer) {
      clearTimeout(timer);
      this.activeTimers.delete(giveawayId);
    }
    const updatedGiveaway = await giveawayRepository.getGiveaway(giveawayId);
    if (updatedGiveaway) {
      await this.updateGiveawayEmbed(updatedGiveaway, winners);
    }
    await auditLogger.logAction({
      action: "GIVEAWAY_END",
      userId: endedBy.id,
      guildId: giveaway.guildId,
      details: {
        giveawayId,
        winners,
        entryCount: entries.length
      }
    });
    return { success: true, winners };
  }
  async rerollGiveaway(giveawayId, rerolledBy, newWinnerCount) {
    const giveaway = await giveawayRepository.getGiveaway(giveawayId);
    if (!giveaway) {
      return { success: false, error: t("commands.giveaway.notFound") };
    }
    if (giveaway.status !== "ended") {
      return { success: false, error: t("commands.giveaway.error") };
    }
    const winnerCount = newWinnerCount || giveaway.winnerCount;
    const entries = await giveawayRepository.getEntries(giveawayId);
    const winners = this.selectWinners(entries, winnerCount);
    await giveawayRepository.updateGiveaway(giveawayId, {
      winners,
      winnerCount
    });
    await this.updateGiveawayEmbed(giveaway, winners);
    await auditLogger.logAction({
      action: "GIVEAWAY_REROLL",
      userId: rerolledBy.id,
      guildId: giveaway.guildId,
      details: {
        giveawayId,
        oldWinners: giveaway.winners,
        newWinners: winners
      }
    });
    return { success: true, winners };
  }
  async updateGiveaway(giveawayId, updates, updatedBy) {
    const giveaway = await giveawayRepository.getGiveaway(giveawayId);
    if (!giveaway || giveaway.status !== "active") {
      throw new Error(t("commands.giveaway.notFound"));
    }
    await giveawayRepository.updateGiveaway(giveawayId, updates);
    const updatedGiveaway = await giveawayRepository.getGiveaway(giveawayId);
    await this.updateGiveawayEmbed(updatedGiveaway);
    await auditLogger.logAction({
      action: "GIVEAWAY_UPDATE",
      userId: updatedBy.id,
      guildId: giveaway.guildId,
      details: {
        giveawayId,
        updates
      }
    });
  }
  async checkRequirements(member, requirements) {
    if (requirements.roleIds && requirements.roleIds.length > 0) {
      const hasRequiredRole = requirements.roleIds.some(
        (roleId) => member.roles.cache.has(roleId)
      );
      if (!hasRequiredRole) {
        return { met: false, reason: t("commands.giveaway.requirementsNotMet") };
      }
    }
    if (requirements.minLevel) {
      const userXP = await xpRepository.getUserXP(member.id, member.guild.id);
      const userLevel = userXP?.level || 0;
      if (userLevel < requirements.minLevel) {
        return { met: false, reason: t("commands.giveaway.requirementsNotMet") };
      }
    }
    if (requirements.minTimeInServer) {
      const joinedAt = member.joinedAt;
      if (!joinedAt) {
        return { met: false, reason: t("commands.giveaway.requirementsNotMet") };
      }
      const timeInServer = Date.now() - joinedAt.getTime();
      const requiredTime = this.parseTimeRequirement(requirements.minTimeInServer);
      if (timeInServer < requiredTime) {
        return {
          met: false,
          reason: t("commands.giveaway.requirementsNotMet")
        };
      }
    }
    if (requirements.minAccountAge) {
      const accountAge = Date.now() - member.user.createdAt.getTime();
      const requiredAge = this.parseTimeRequirement(requirements.minAccountAge);
      if (accountAge < requiredAge) {
        return {
          met: false,
          reason: t("commands.giveaway.requirementsNotMet")
        };
      }
    }
    return { met: true };
  }
  calculateBonusEntries(member, bonusEntries) {
    let multiplier = 1;
    if (bonusEntries.roles) {
      for (const [roleId, bonus] of Object.entries(bonusEntries.roles)) {
        if (member.roles.cache.has(roleId)) {
          multiplier = Math.max(multiplier, bonus);
        }
      }
    }
    if (bonusEntries.booster && member.premiumSince) {
      multiplier = Math.max(multiplier, bonusEntries.booster);
    }
    return multiplier;
  }
  selectWinners(entries, count) {
    if (entries.length === 0) return [];
    const weightedEntries = [];
    for (const entry of entries) {
      for (let i = 0; i < entry.entries; i++) {
        weightedEntries.push(entry.userId);
      }
    }
    const shuffled = weightedEntries.sort(() => Math.random() - 0.5);
    const winners = /* @__PURE__ */ new Set();
    for (const userId of shuffled) {
      winners.add(userId);
      if (winners.size >= Math.min(count, entries.length)) break;
    }
    return Array.from(winners);
  }
  async updateGiveawayEmbed(giveaway, winners) {
    const client = global.client;
    if (!client || !giveaway) return;
    try {
      const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
      if (!channel || !giveaway.messageId) return;
      const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
      if (!message) return;
      const embed = new EmbedBuilder().setColor(giveaway.status === "active" ? giveaway.embedColor || 39423 : 8421504).setTitle(
        giveaway.status === "active" ? giveaway.embedTitle || t("commands.giveaway.embed.title") : t("commands.giveaway.embed.ended")
      ).setDescription(
        giveaway.description || t("commands.giveaway.embed.description", { prize: giveaway.prize })
      ).addFields(
        {
          name: t("commands.giveaway.embed.hostedBy"),
          value: `<@${giveaway.hostedBy}>`,
          inline: true
        },
        {
          name: t("commands.giveaway.embed.winners"),
          value: giveaway.winnerCount.toString(),
          inline: true
        }
      ).setFooter({
        text: t("commands.giveaway.embed.footer", { id: giveaway.giveawayId })
      }).setTimestamp();
      if (giveaway.embedImage) embed.setImage(giveaway.embedImage);
      if (giveaway.embedThumbnail) embed.setThumbnail(giveaway.embedThumbnail);
      if (giveaway.status === "active") {
        embed.addFields({
          name: t("commands.giveaway.embed.endsAt"),
          value: `<t:${Math.floor(giveaway.endTime.getTime() / 1e3)}:R>`,
          inline: true
        });
      } else if (winners && winners.length > 0) {
        embed.addFields({
          name: t("commands.giveaway.embed.winnersField"),
          value: winners.map((w) => `<@${w}>`).join("\n"),
          inline: false
        });
      } else {
        embed.addFields({
          name: t("commands.giveaway.embed.winnersField"),
          value: t("commands.giveaway.embed.noWinners"),
          inline: false
        });
      }
      const components = giveaway.status === "active" ? [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`gw_enter:${giveaway.giveawayId}`).setLabel(t("commands.giveaway.buttons.enter")).setStyle(ButtonStyle.Primary).setEmoji("\u{1F389}"),
          new ButtonBuilder().setCustomId(`gw_info:${giveaway.giveawayId}`).setLabel(t("commands.giveaway.buttons.info")).setStyle(ButtonStyle.Secondary).setEmoji("\u2139\uFE0F")
        )
      ] : [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`gw_enter:${giveaway.giveawayId}`).setLabel(t("commands.giveaway.buttons.enter")).setStyle(ButtonStyle.Primary).setEmoji("\u{1F389}").setDisabled(true),
          new ButtonBuilder().setCustomId(`gw_info:${giveaway.giveawayId}`).setLabel(t("commands.giveaway.buttons.info")).setStyle(ButtonStyle.Secondary).setEmoji("\u2139\uFE0F").setDisabled(true)
        )
      ];
      await message.edit({ embeds: [embed], components });
      if (giveaway.status === "ended" && winners && winners.length > 0 && !giveaway.announcementSent) {
        const winnerMentions = winners.map((w) => `<@${w}>`).join(", ");
        await channel.send({
          content: `\u{1F389} **GIVEAWAY ENDED** \u{1F389}

Congratulations ${winnerMentions}! You won **${giveaway.prize}**!`,
          reply: { messageReference: giveaway.messageId }
        }).catch(() => {
          void channel.send({
            content: `\u{1F389} **GIVEAWAY ENDED** \u{1F389}

Congratulations ${winnerMentions}! You won **${giveaway.prize}**!`
          });
        });
        giveaway.announcementSent = true;
        await giveawayRepository.updateGiveaway(giveaway.giveawayId, { announcementSent: true });
      }
    } catch (error) {
      logger.error("Error updating giveaway embed:", error);
    }
  }
  scheduleGiveawayEnd(giveaway) {
    const endTime = new Date(giveaway.endTime);
    const now = /* @__PURE__ */ new Date();
    const timeUntilEnd = endTime.getTime() - now.getTime();
    logger.info(
      `Giveaway ${giveaway.giveawayId}: End time: ${endTime.toISOString()}, Now: ${now.toISOString()}, Time until end: ${timeUntilEnd}ms (${Math.floor(timeUntilEnd / 1e3)}s)`
    );
    if (timeUntilEnd <= 0) {
      logger.info(`Ending expired giveaway immediately: ${giveaway.giveawayId}`);
      void this.endGiveaway(giveaway.giveawayId, { id: "system" });
      return;
    }
    const timeoutValue = Math.min(timeUntilEnd, 2147483647);
    const timer = setTimeout(() => {
      logger.info(`Timer triggered for giveaway: ${giveaway.giveawayId}`);
      void this.endGiveaway(giveaway.giveawayId, { id: "system" });
      this.activeTimers.delete(giveaway.giveawayId);
    }, timeoutValue);
    this.activeTimers.set(giveaway.giveawayId, timer);
    logger.info(
      `Scheduled giveaway ${giveaway.giveawayId} to end in ${Math.floor(timeUntilEnd / 1e3)}s`
    );
  }
  async initializeActiveGiveaways() {
    const activeGiveaways = await giveawayRepository.getActiveGiveaways();
    logger.info(`Found ${activeGiveaways.length} active giveaways`);
    for (const giveaway of activeGiveaways) {
      this.scheduleGiveawayEnd({
        giveawayId: giveaway.giveawayId,
        endTime: giveaway.endTime,
        status: giveaway.status
      });
    }
    this.startPeriodicExpiredCheck();
    await this.processPendingAnnouncements();
  }
  startPeriodicExpiredCheck() {
    setInterval(() => {
      void (async () => {
        try {
          await this.processExpiredGiveaways();
          await this.processScheduledGiveaways();
        } catch (error) {
          logger.error("Error processing expired giveaways:", error);
        }
      })();
    }, 6e4);
  }
  async processExpiredGiveaways() {
    const expiredGiveaways = await giveawayRepository.getExpiredGiveaways();
    for (const giveaway of expiredGiveaways) {
      logger.info(`Processing expired giveaway: ${giveaway.giveawayId}`);
      await this.endGiveaway(giveaway.giveawayId, { id: "system" });
    }
  }
  async processScheduledGiveaways() {
    const scheduledGiveaways = await giveawayRepository.getScheduledGiveaways();
    for (const giveaway of scheduledGiveaways) {
      logger.info(`Processing scheduled giveaway: ${giveaway.giveawayId}`);
      const client = global.client;
      if (!client) continue;
      if (!client.guilds.cache.has(giveaway.guildId)) continue;
      try {
        const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
        if (!channel) continue;
        const embed = new EmbedBuilder().setTitle(giveaway.embedTitle || "\u{1F389} GIVEAWAY \u{1F389}").setDescription(
          `**Prize:** ${giveaway.prize}
${giveaway.description || ""}

React with \u{1F389} to enter!`
        ).addFields(
          {
            name: "Ends",
            value: `<t:${Math.floor(new Date(giveaway.endTime).getTime() / 1e3)}:R>`,
            inline: true
          },
          { name: "Winners", value: giveaway.winnerCount.toString(), inline: true },
          { name: "Hosted By", value: `<@${giveaway.hostedBy}>`, inline: true }
        ).setColor(giveaway.embedColor || 5793266).setFooter({
          text: t("commands.giveaway.embed.footer", {
            id: giveaway.giveawayId,
            defaultValue: `Giveaway ID: ${giveaway.giveawayId}`
          })
        }).setTimestamp(new Date(giveaway.endTime));
        if (giveaway.embedImage) embed.setImage(giveaway.embedImage);
        if (giveaway.embedThumbnail) embed.setThumbnail(giveaway.embedThumbnail);
        const reqs = giveaway.requirements || {};
        if (reqs.roleIds && reqs.roleIds.length > 0) {
          embed.addFields({
            name: "Required Role",
            value: `<@&${reqs.roleIds[0]}>`,
            inline: false
          });
        }
        const button = new ButtonBuilder().setCustomId(`gw_enter:${giveaway.giveawayId}`).setLabel(t("commands.giveaway.buttons.enter", { defaultValue: "Enter" })).setStyle(ButtonStyle.Primary).setEmoji("\u{1F389}");
        const infoButton = new ButtonBuilder().setCustomId(`gw_info:${giveaway.giveawayId}`).setLabel(t("commands.giveaway.buttons.info", { defaultValue: "Info" })).setStyle(ButtonStyle.Secondary).setEmoji("\u2139\uFE0F");
        const row = new ActionRowBuilder().addComponents(button, infoButton);
        const message = await channel.send({ embeds: [embed], components: [row] });
        await giveawayRepository.updateGiveaway(giveaway.giveawayId, {
          status: "active",
          messageId: message.id
        });
        this.scheduleGiveawayEnd({
          giveawayId: giveaway.giveawayId,
          endTime: giveaway.endTime,
          status: "active"
        });
      } catch (error) {
        logger.error(`Error sending scheduled giveaway ${giveaway.giveawayId}:`, error);
      }
    }
  }
  async processPendingAnnouncements() {
    const pending = await giveawayRepository.getEndedGiveawaysPendingAnnouncement();
    for (const giveaway of pending) {
      const winners = Array.isArray(giveaway.winners) ? giveaway.winners : [];
      if (winners.length === 0) continue;
      logger.info(`Sending pending giveaway announcement for ${giveaway.giveawayId}`);
      await this.updateGiveawayEmbed(giveaway, winners);
    }
  }
  parseTimeRequirement(time) {
    const regex = /^(\d+)([dhm])$/;
    const match = time.match(regex);
    if (!match) return 0;
    const value = parseInt(match[1]);
    const unit = match[2];
    switch (unit) {
      case "d":
        return value * 24 * 60 * 60 * 1e3;
      case "h":
        return value * 60 * 60 * 1e3;
      case "m":
        return value * 60 * 1e3;
      default:
        return 0;
    }
  }
}
export const giveawayService = new GiveawayService();
