"use strict";
import { jtcService } from "../../services/jtcService";
import { logger } from "../../utils/logger";
export async function handleJTCSelectMenus(interaction) {
  try {
    if (interaction.customId === "jtc_limit") {
      await jtcService.handleUserLimit(interaction);
    }
  } catch (error) {
    logger.error(`Error handling JTC select menu ${interaction.customId}:`, error);
  }
}
