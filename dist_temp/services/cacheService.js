"use strict";
import { Redis } from "ioredis";
import { logger } from "../utils/logger";
export class CacheService {
  redis;
  constructor() {
    this.redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
    this.redis.on("error", (err) => {
      logger.error("Redis connection error:", err);
    });
    this.redis.on("connect", () => {
      logger.info("Connected to Redis successfully");
    });
  }
  /**
   * Caches guild settings to prevent database spam on every message
   */
  async getGuildSettings(guildId, fetchFn) {
    try {
      const cached = await this.redis.get(`guild:${guildId}:settings`);
      if (cached) {
        return JSON.parse(cached);
      }
      const dbSettings = await fetchFn();
      if (dbSettings) {
        if (typeof dbSettings.customCommands === "string") {
          try {
            dbSettings.parsedCustomCommands = JSON.parse(dbSettings.customCommands);
          } catch (e) {
            dbSettings.parsedCustomCommands = [];
          }
        }
        await this.redis.setex(`guild:${guildId}:settings`, 300, JSON.stringify(dbSettings));
      }
      return dbSettings;
    } catch (error) {
      logger.error(`Error in cache service for guild ${guildId}:`, error);
      return await fetchFn();
    }
  }
  /**
   * Invalidate guild settings when updated from the dashboard
   */
  async invalidateGuildSettings(guildId) {
    await this.redis.del(`guild:${guildId}:settings`);
  }
}
export const cacheService = new CacheService();
