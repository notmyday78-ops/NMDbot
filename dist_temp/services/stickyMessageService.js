"use strict";
import { logger } from "../utils/logger";
import { EmbedFactory } from "../utils/EmbedFactory";
export class StickyMessageService {
  // In-memory tracking of the last sticky message ID per channel
  lastStickyMessages = /* @__PURE__ */ new Map();
  processingChannels = /* @__PURE__ */ new Set();
  /**
   * Evaluates if a message is sent in a sticky channel, deletes the old sticky,
   * and posts a new one at the bottom.
   */
  async evaluateMessage(message, settings) {
    if (!message.guild || message.author.bot) return;
    if (this.processingChannels.has(message.channel.id)) return;
    if (!settings || !settings.stickies) return;
    let stickiesArray = [];
    try {
      if (typeof settings.stickies === "string") {
        stickiesArray = JSON.parse(settings.stickies);
      } else if (Array.isArray(settings.stickies)) {
        stickiesArray = settings.stickies;
      }
    } catch (e) {
      return;
    }
    const stickyObj = stickiesArray.find((s) => s.channelId === message.channel.id);
    if (!stickyObj || !stickyObj.content) return;
    const stickyText = stickyObj.content;
    this.processingChannels.add(message.channel.id);
    try {
      const channel = message.channel;
      const lastStickyId = this.lastStickyMessages.get(channel.id);
      if (lastStickyId) {
        try {
          const oldMessage = await channel.messages.fetch(lastStickyId);
          if (oldMessage && oldMessage.deletable) {
            await oldMessage.delete();
          }
        } catch (e) {
        }
      }
      const embed = EmbedFactory.info(stickyText).setFooter({ text: "\u{1F4CC} Sticky Message" });
      const newSticky = await channel.send({ embeds: [embed] });
      this.lastStickyMessages.set(channel.id, newSticky.id);
    } catch (error) {
      logger.error(`Error handling sticky message for channel ${message.channel.id}:`, error);
    } finally {
      setTimeout(() => {
        this.processingChannels.delete(message.channel.id);
      }, 3e3);
    }
  }
}
export const stickyMessageService = new StickyMessageService();
