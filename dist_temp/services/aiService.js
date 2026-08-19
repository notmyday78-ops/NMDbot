"use strict";
import { GoogleGenAI } from "@google/genai";
import { config } from "../config/env";
import { logger } from "../utils/logger";
import { guildService } from "./guildService";
class AIService {
  ai = null;
  constructor() {
    if (config.GEMINI_API_KEY) {
      this.ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
    }
  }
  async evaluateMessage(message) {
    if (!this.ai) return false;
    if (!message.mentions.has(message.client.user)) return false;
    if (!message.guild) return false;
    const guildSettings = await guildService.getGuildSettings(message.guild.id);
    if (!guildSettings.aiEnabled) return false;
    if (guildSettings.aiChannel && message.channel.id !== guildSettings.aiChannel) {
      return false;
    }
    try {
      if ("sendTyping" in message.channel) {
        await message.channel.sendTyping();
      }
      const botMention = `<@${message.client.user.id}>`;
      const botMentionNickname = `<@!${message.client.user.id}>`;
      let content = message.content.replace(botMention, "").replace(botMentionNickname, "").trim();
      if (!content) {
        content = "Hello!";
      }
      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [{ text: content }]
          }
        ],
        config: {
          systemInstruction: guildSettings.aiPersona || "You are a helpful Discord bot assistant."
        }
      });
      const replyContent = response.text;
      if (replyContent) {
        const chunk = replyContent.length > 2e3 ? replyContent.slice(0, 1997) + "..." : replyContent;
        await message.reply(chunk);
      } else {
        await message.reply("I'm not sure how to respond to that.");
      }
      return true;
    } catch (error) {
      logger.error("Failed to generate AI response:", error);
      await message.reply("Sorry, I'm having trouble thinking right now.");
      return true;
    }
  }
}
export const aiService = new AIService();
