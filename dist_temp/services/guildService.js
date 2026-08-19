"use strict";
import { guildRepository } from "../repositories/guildRepository";
import { logger } from "../utils/logger";
export class GuildService {
  async ensureGuild(guild) {
    try {
      let guildData = await guildRepository.findById(guild.id);
      if (!guildData) {
        logger.info(`Creating database entry for guild ${guild.name} (${guild.id})`);
        guildData = await guildRepository.create(guild.id);
        await guildRepository.updateSettings(guild.id, {
          welcomeEnabled: false,
          goodbyeEnabled: false,
          logsEnabled: false,
          xpEnabled: true,
          xpRate: 1
        });
      }
      return guildData;
    } catch (error) {
      logger.error(`Failed to ensure guild ${guild.id}:`, error);
      throw error;
    }
  }
  async getGuildSettings(guildId) {
    try {
      let settings = await guildRepository.getSettings(guildId);
      if (!settings) {
        settings = await guildRepository.updateSettings(guildId, {
          welcomeEnabled: false,
          goodbyeEnabled: false,
          logsEnabled: false,
          xpEnabled: true,
          xpRate: 1
        });
      }
      return settings;
    } catch (error) {
      logger.error(`Failed to get guild settings for ${guildId}:`, error);
      throw error;
    }
  }
  async updateGuildSettings(guildId, settings) {
    try {
      return await guildRepository.updateSettings(guildId, settings);
    } catch (error) {
      logger.error(`Failed to update guild settings for ${guildId}:`, error);
      throw error;
    }
  }
  async deleteGuild(guildId) {
    try {
      return await guildRepository.delete(guildId);
    } catch (error) {
      logger.error(`Failed to delete guild ${guildId}:`, error);
      throw error;
    }
  }
  async getGuildLanguage(guildId) {
    try {
      const guild = await guildRepository.findById(guildId);
      return guild?.language || "en";
    } catch (error) {
      logger.error(`Failed to get guild language for ${guildId}:`, error);
      return "en";
    }
  }
}
export const guildService = new GuildService();
