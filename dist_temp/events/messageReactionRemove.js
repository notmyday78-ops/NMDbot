"use strict";
import {
  Events
} from "discord.js";
import { starboardService } from "../services/starboardService";
import { logger } from "../utils/logger";
export const name = Events.MessageReactionRemove;
export const once = false;
export async function execute(reaction, user) {
  if (user.bot) return;
  if (!reaction.message.guild) return;
  try {
    if (reaction.partial) {
      await reaction.fetch();
    }
    if (reaction.message.partial) {
      await reaction.message.fetch();
    }
    const emojiName = reaction.emoji.name;
    if (!emojiName) return;
    await starboardService.handleReaction(
      reaction.message,
      emojiName,
      reaction.count || 0
    );
  } catch (error) {
    logger.error("Error in messageReactionRemove event:", error);
  }
}
