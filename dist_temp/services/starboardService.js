"use strict";
import { eq } from "drizzle-orm";
import { getDatabase } from "../database/connection";
import { starboardSettings, starboardMessages } from "../database/schema/starboard";
import { EmbedBuilder } from "discord.js";
import { logger } from "../utils/logger";
export const starboardService = {
  async getSettings(guildId) {
    const db = getDatabase();
    const settings = await db.select().from(starboardSettings).where(eq(starboardSettings.guildId, guildId)).limit(1);
    return settings[0] || null;
  },
  async enable(guildId, channelId) {
    const db = getDatabase();
    await db.insert(starboardSettings).values({ guildId, channelId, enabled: true }).onConflictDoUpdate({
      target: starboardSettings.guildId,
      set: { channelId, enabled: true, updatedAt: /* @__PURE__ */ new Date() }
    });
  },
  async disable(guildId) {
    const db = getDatabase();
    await db.update(starboardSettings).set({ enabled: false, updatedAt: /* @__PURE__ */ new Date() }).where(eq(starboardSettings.guildId, guildId));
  },
  async updateThreshold(guildId, threshold) {
    const db = getDatabase();
    await db.update(starboardSettings).set({ threshold, updatedAt: /* @__PURE__ */ new Date() }).where(eq(starboardSettings.guildId, guildId));
  },
  async updateEmoji(guildId, emoji) {
    const db = getDatabase();
    await db.update(starboardSettings).set({ emoji, updatedAt: /* @__PURE__ */ new Date() }).where(eq(starboardSettings.guildId, guildId));
  },
  async handleReaction(message, emojiName, count) {
    if (!message.guild || !message.channel || !message.author) return;
    const guildId = message.guild.id;
    const settings = await this.getSettings(guildId);
    if (!settings || !settings.enabled || !settings.channelId) return;
    if (settings.emoji !== emojiName) return;
    const db = getDatabase();
    const existing = await db.select().from(starboardMessages).where(eq(starboardMessages.messageId, message.id)).limit(1);
    const existingMsg = existing[0];
    const starboardChannel = message.guild.channels.cache.get(settings.channelId);
    if (!starboardChannel) return;
    if (count >= settings.threshold) {
      const content = `${settings.emoji} **${count}** | <#${message.channel.id}>`;
      const embed = new EmbedBuilder().setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() }).setDescription(message.content || "*No content*").setColor("#FFAC33").setTimestamp(message.createdAt).addFields({ name: "Original Message", value: `[Jump to message](${message.url})` });
      if (message.attachments.size > 0) {
        embed.setImage(message.attachments.first()?.url || null);
      }
      if (existingMsg && existingMsg.starboardMessageId) {
        try {
          const sMsg = await starboardChannel.messages.fetch(existingMsg.starboardMessageId);
          if (sMsg) {
            await sMsg.edit({ content, embeds: [embed] });
            const db2 = getDatabase();
            await db2.update(starboardMessages).set({ stars: count, updatedAt: /* @__PURE__ */ new Date() }).where(eq(starboardMessages.messageId, message.id));
          }
        } catch (e) {
          logger.error("Failed to update starboard message:", e);
        }
      } else {
        try {
          const sMsg = await starboardChannel.send({ content, embeds: [embed] });
          const db2 = getDatabase();
          await db2.insert(starboardMessages).values({
            messageId: message.id,
            guildId,
            channelId: message.channel.id,
            authorId: message.author.id,
            starboardMessageId: sMsg.id,
            stars: count
          }).onConflictDoUpdate({
            target: starboardMessages.messageId,
            set: { starboardMessageId: sMsg.id, stars: count, updatedAt: /* @__PURE__ */ new Date() }
          });
        } catch (e) {
          logger.error("Failed to send starboard message:", e);
        }
      }
    } else if (count < settings.threshold && existingMsg && existingMsg.starboardMessageId) {
      try {
        const sMsg = await starboardChannel.messages.fetch(existingMsg.starboardMessageId);
        if (sMsg) {
          await sMsg.delete();
        }
        const db2 = getDatabase();
        await db2.delete(starboardMessages).where(eq(starboardMessages.messageId, message.id));
      } catch (e) {
        logger.error("Failed to delete starboard message:", e);
      }
    }
  },
  async handleUnstar(message, emojiName, count) {
    const guildId = message.guild?.id;
    if (!guildId) return;
    const db = getDatabase();
    if (count === 0) {
      await db.delete(starboardMessages).where(eq(starboardMessages.messageId, message.id));
    }
  }
};
