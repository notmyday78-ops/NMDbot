"use strict";
import { Router } from "express";
import { client } from "../../index";
import { getDatabase } from "../../database/connection";
import { giveaways, giveawayEntries } from "../../database/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "../../utils/logger";
import { z } from "zod";
import { t } from "../../i18n";
import { v4 as uuidv4 } from "uuid";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from "discord.js";
import { giveawayService } from "../../services/giveawayService";
import { crossShardService } from "../../services/crossShardService";
const router = Router();
const createGiveawaySchema = z.object({
  prize: z.string().min(1).max(250),
  description: z.string().max(1e3).optional(),
  channelId: z.string(),
  duration: z.number().min(6e4),
  // Minimum 1 minute in milliseconds
  winnerCount: z.number().min(1).max(20),
  hostedBy: z.string(),
  requiredRole: z.string().optional(),
  bonusEntries: z.array(
    z.object({
      roleId: z.string(),
      entries: z.number().min(1).max(10)
    })
  ).optional(),
  allowedRoles: z.array(z.string()).optional(),
  blockedRoles: z.array(z.string()).optional(),
  embedTitle: z.string().max(255).optional(),
  embedColor: z.string().or(z.number()).optional(),
  embedImage: z.string().url().max(500).optional(),
  embedThumbnail: z.string().url().max(500).optional(),
  startTime: z.string().datetime().optional()
});
const updateGiveawaySchema = z.object({
  prize: z.string().min(1).max(250).optional(),
  description: z.string().max(1e3).optional(),
  winnerCount: z.number().min(1).max(20).optional(),
  endTime: z.string().datetime().optional(),
  requiredRole: z.string().optional(),
  bonusEntries: z.array(
    z.object({
      roleId: z.string(),
      entries: z.number().min(1).max(10)
    })
  ).optional(),
  embedTitle: z.string().max(255).optional(),
  embedColor: z.string().or(z.number()).optional(),
  embedImage: z.string().url().max(500).optional(),
  embedThumbnail: z.string().url().max(500).optional()
});
router.post("/:guildId/giveaways", async (req, res) => {
  const { guildId } = req.params;
  try {
    const validation = createGiveawaySchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "Validation Error",
        message: "Invalid request body",
        details: validation.error.errors
      });
    }
    const data = validation.data;
    const guild = await crossShardService.fetchGuild(client, guildId);
    if (!guild) {
      return res.status(404).json({
        error: "Not Found",
        message: "Guild not found"
      });
    }
    const channel = await client.channels.fetch(data.channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Invalid channel ID or channel is not text-based"
      });
    }
    const giveawayId = uuidv4();
    const isScheduled = data.startTime && new Date(data.startTime) > /* @__PURE__ */ new Date();
    const baseTime = isScheduled ? new Date(data.startTime).getTime() : Date.now();
    const endTime = new Date(baseTime + data.duration);
    let color = typeof data.embedColor === "string" ? parseInt(data.embedColor.replace("#", ""), 16) : data.embedColor || 5793266;
    if (isNaN(color)) color = 5793266;
    const embed = new EmbedBuilder().setTitle(data.embedTitle || "\u{1F389} GIVEAWAY \u{1F389}").setDescription(
      `**Prize:** ${data.prize}
${data.description || ""}

React with \u{1F389} to enter!`
    ).addFields(
      { name: "Ends", value: `<t:${Math.floor(endTime.getTime() / 1e3)}:R>`, inline: true },
      { name: "Winners", value: data.winnerCount.toString(), inline: true },
      { name: "Hosted By", value: `<@${data.hostedBy}>`, inline: true }
    ).setColor(color).setFooter({ text: `Giveaway ID: ${giveawayId}` }).setTimestamp(endTime);
    if (data.embedImage) embed.setImage(data.embedImage);
    if (data.embedThumbnail) embed.setThumbnail(data.embedThumbnail);
    if (data.requiredRole) {
      embed.addFields({ name: "Required Role", value: `<@&${data.requiredRole}>`, inline: false });
    }
    let messageId = null;
    if (!isScheduled) {
      const message = await channel.send({
        embeds: [embed]
      });
      messageId = message.id;
    }
    const giveaway = await giveawayService.createGiveaway({
      guildId,
      channelId: data.channelId,
      hostedBy: data.hostedBy,
      prize: data.prize,
      winnerCount: data.winnerCount,
      endTime,
      startTime: data.startTime ? new Date(data.startTime) : null,
      description: data.description || null,
      requirements: data.requiredRole ? { roleIds: [data.requiredRole] } : {},
      bonusEntries: data.bonusEntries ? { roles: Object.fromEntries(data.bonusEntries.map((b) => [b.roleId, b.entries])) } : {},
      embedTitle: data.embedTitle || null,
      embedColor: color,
      embedImage: data.embedImage || null,
      embedThumbnail: data.embedThumbnail || null
    });
    if (messageId) {
      await giveawayService.updateGiveawayMessage(giveaway.giveawayId, messageId);
      try {
        const message = await channel.messages.fetch(messageId);
        const button = new ButtonBuilder().setCustomId(`gw_enter:${giveaway.giveawayId}`).setLabel(t("commands.giveaway.buttons.enter", { defaultValue: "Enter" })).setStyle(ButtonStyle.Primary).setEmoji("\u{1F389}");
        const infoButton = new ButtonBuilder().setCustomId(`gw_info:${giveaway.giveawayId}`).setLabel(t("commands.giveaway.buttons.info", { defaultValue: "Info" })).setStyle(ButtonStyle.Secondary).setEmoji("\u2139\uFE0F");
        const row = new ActionRowBuilder().addComponents(button, infoButton);
        embed.setFooter({
          text: t("commands.giveaway.embed.footer", {
            id: giveaway.giveawayId,
            defaultValue: `Giveaway ID: ${giveaway.giveawayId}`
          })
        });
        await message.edit({ embeds: [embed], components: [row] });
      } catch (error) {
        logger.error("Error adding buttons to giveaway message:", error);
      }
    }
    logger.info(`Created giveaway ${giveaway.giveawayId} in guild ${guildId}`);
    return res.status(201).json({
      success: true,
      giveaway: {
        id: giveaway.giveawayId,
        prize: data.prize,
        channelId: data.channelId,
        messageId,
        startTime: data.startTime,
        endTime: endTime.toISOString(),
        winnerCount: data.winnerCount
      }
    });
  } catch (error) {
    logger.error("Error creating giveaway:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to create giveaway"
    });
  }
});
router.patch("/:guildId/giveaways/:giveawayId", async (req, res) => {
  const { guildId, giveawayId } = req.params;
  try {
    const validation = updateGiveawaySchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "Validation Error",
        message: "Invalid request body",
        details: validation.error.errors
      });
    }
    const db = getDatabase();
    const updates = validation.data;
    const [giveaway] = await db.select().from(giveaways).where(and(eq(giveaways.giveawayId, giveawayId), eq(giveaways.guildId, guildId))).limit(1);
    if (!giveaway) {
      return res.status(404).json({
        error: "Not Found",
        message: "Giveaway not found"
      });
    }
    if (giveaway.status !== "active") {
      return res.status(400).json({
        error: "Bad Request",
        message: "Cannot update ended giveaway"
      });
    }
    const updateData = {};
    if (updates.prize) updateData.prize = updates.prize;
    if (updates.description !== void 0) updateData.description = updates.description;
    if (updates.winnerCount) updateData.winnerCount = updates.winnerCount;
    if (updates.endTime) updateData.endTime = new Date(updates.endTime);
    if (updates.requiredRole !== void 0)
      updateData.requirements = { requiredRole: updates.requiredRole };
    if (updates.bonusEntries) updateData.bonusEntries = updates.bonusEntries || {};
    if (updates.embedTitle !== void 0) updateData.embedTitle = updates.embedTitle;
    if (updates.embedColor !== void 0) {
      const parsedColor = typeof updates.embedColor === "string" ? parseInt(updates.embedColor.replace("#", ""), 16) : updates.embedColor;
      if (!isNaN(parsedColor)) updateData.embedColor = parsedColor;
    }
    if (updates.embedImage !== void 0) updateData.embedImage = updates.embedImage;
    if (updates.embedThumbnail !== void 0) updateData.embedThumbnail = updates.embedThumbnail;
    await db.update(giveaways).set(updateData).where(and(eq(giveaways.giveawayId, giveawayId), eq(giveaways.guildId, guildId)));
    const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
    if (channel && giveaway.messageId) {
      try {
        const message = await channel.messages.fetch(giveaway.messageId);
        const endTime = updateData.endTime || giveaway.endTime;
        const embedColor = updateData.embedColor !== void 0 ? updateData.embedColor : giveaway.embedColor;
        const embedTitle = updateData.embedTitle !== void 0 ? updateData.embedTitle : giveaway.embedTitle;
        const embedImage = updateData.embedImage !== void 0 ? updateData.embedImage : giveaway.embedImage;
        const embedThumbnail = updateData.embedThumbnail !== void 0 ? updateData.embedThumbnail : giveaway.embedThumbnail;
        const embed = new EmbedBuilder().setTitle(embedTitle || "\u{1F389} GIVEAWAY \u{1F389}").setDescription(
          `**Prize:** ${updateData.prize || giveaway.prize}
${updateData.description || giveaway.description || ""}

React with \u{1F389} to enter!`
        ).addFields(
          { name: "Ends", value: `<t:${Math.floor(endTime.getTime() / 1e3)}:R>`, inline: true },
          {
            name: "Winners",
            value: (updateData.winnerCount || giveaway.winnerCount).toString(),
            inline: true
          },
          { name: "Hosted By", value: `<@${giveaway.hostedBy}>`, inline: true }
        ).setColor(embedColor).setFooter({ text: `Giveaway ID: ${giveawayId}` }).setTimestamp(endTime);
        if (embedImage) embed.setImage(embedImage);
        if (embedThumbnail) embed.setThumbnail(embedThumbnail);
        await message.edit({ embeds: [embed] });
      } catch (error) {
        logger.warn(`Could not update giveaway message: ${error}`);
      }
    }
    logger.info(`Updated giveaway ${giveawayId} in guild ${guildId}`);
    return res.json({
      success: true,
      message: "Giveaway updated successfully"
    });
  } catch (error) {
    logger.error("Error updating giveaway:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to update giveaway"
    });
  }
});
router.delete("/:guildId/giveaways/:giveawayId", async (req, res) => {
  const { guildId, giveawayId } = req.params;
  try {
    const db = getDatabase();
    const [giveaway] = await db.select().from(giveaways).where(and(eq(giveaways.giveawayId, giveawayId), eq(giveaways.guildId, guildId))).limit(1);
    if (!giveaway) {
      return res.status(404).json({
        error: "Not Found",
        message: "Giveaway not found"
      });
    }
    const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
    if (channel && giveaway.messageId) {
      try {
        const message = await channel.messages.fetch(giveaway.messageId);
        await message.delete();
      } catch (error) {
        logger.warn(`Could not delete giveaway message: ${error}`);
      }
    }
    await db.transaction(async (tx) => {
      await tx.delete(giveawayEntries).where(eq(giveawayEntries.giveawayId, giveawayId));
      await tx.delete(giveaways).where(eq(giveaways.giveawayId, giveawayId));
    });
    logger.info(`Deleted giveaway ${giveawayId} from guild ${guildId}`);
    return res.json({
      success: true,
      message: "Giveaway deleted successfully"
    });
  } catch (error) {
    logger.error("Error deleting giveaway:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to delete giveaway"
    });
  }
});
router.post("/:guildId/giveaways/:giveawayId/end", async (req, res) => {
  const { guildId, giveawayId } = req.params;
  try {
    const result = await giveawayService.endGiveaway(giveawayId, { id: "api" });
    if (!result.success) {
      return res.status(400).json({
        error: "Bad Request",
        message: result.error || "Giveaway not found or already ended"
      });
    }
    logger.info(`Ended giveaway ${giveawayId} in guild ${guildId}`);
    return res.json({
      success: true,
      winners: result.winners,
      message: "Giveaway ended successfully"
    });
  } catch (error) {
    logger.error("Error ending giveaway:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to end giveaway"
    });
  }
});
router.post("/:guildId/giveaways/:giveawayId/reroll", async (req, res) => {
  const { guildId, giveawayId } = req.params;
  const { count = 1 } = req.body;
  try {
    const result = await giveawayService.rerollGiveaway(giveawayId, { id: "api" }, count);
    if (!result.success) {
      return res.status(400).json({
        error: "Bad Request",
        message: result.error || "No eligible participants for reroll"
      });
    }
    logger.info(`Rerolled giveaway ${giveawayId} winners in guild ${guildId}`);
    return res.json({
      success: true,
      newWinners: result.winners,
      message: "Giveaway rerolled successfully"
    });
  } catch (error) {
    logger.error("Error rerolling giveaway:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to reroll giveaway"
    });
  }
});
export const giveawaysRouter = router;
