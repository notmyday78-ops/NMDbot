import { Redis } from 'ioredis';
import { logger } from '../utils/logger';

export class CacheService {
  public redis: Redis;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      keyPrefix: process.env.INSTANCE_ID ? `${process.env.INSTANCE_ID}:` : undefined,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy(times) {
        if (times > 3) {
          logger.warn('Redis retry limit reached. Stopping retries.');
          return null;
        }
        return Math.min(times * 1000, 3000);
      }
    });
    
    let hasLoggedRedisError = false;

    this.redis.on('error', (err) => {
      if (!hasLoggedRedisError) {
        logger.warn(`Redis connection failed: ${err.message}. Running with in-memory fallback.`);
        hasLoggedRedisError = true;
      }
    });
    
    this.redis.on('connect', () => {
      hasLoggedRedisError = false;
      logger.info('Connected to Redis successfully');
    });
  }

  /**
   * Caches guild settings to prevent database spam on every message
   */
  async getGuildSettings<T extends { customCommands?: string | null, parsedCustomCommands?: unknown }>(guildId: string, fetchFn: () => Promise<T | null>): Promise<T | null> {
    try {
      const cached = await this.redis.get(`guild:${guildId}:settings`);
      if (cached) {
        return JSON.parse(cached) as T;
      }
      
      const dbSettings = await fetchFn();
      if (dbSettings) {
        // Pre-parse custom commands before caching to fix the messageCreate bottleneck
        if (typeof dbSettings.customCommands === 'string') {
          try {
            dbSettings.parsedCustomCommands = JSON.parse(dbSettings.customCommands);
          } catch (e) {
            dbSettings.parsedCustomCommands = [];
          }
        }
        
        // Cache for 5 minutes
        await this.redis.setex(`guild:${guildId}:settings`, 300, JSON.stringify(dbSettings));
      }
      return dbSettings;
    } catch (error) {
      // Just fallback silently to fetchFn to avoid spamming the log if redis is down
      return await fetchFn();
    }
  }

  /**
   * Caches basic guild data to prevent database spam on every message
   */
  async getGuildData<T>(guildId: string, fetchFn: () => Promise<T | null>): Promise<T | null> {
    try {
      const cached = await this.redis.get(`guild:${guildId}:data`);
      if (cached) {
        return JSON.parse(cached) as T;
      }
      
      const dbData = await fetchFn();
      if (dbData) {
        // Cache for 10 minutes
        await this.redis.setex(`guild:${guildId}:data`, 600, JSON.stringify(dbData));
      }
      return dbData;
    } catch (error) {
      return await fetchFn();
    }
  }

  /**
   * Invalidate guild data
   */
  async invalidateGuildData(guildId: string): Promise<void> {
    try {
      await this.redis.del(`guild:${guildId}:data`);
    } catch (error) {
      // Ignore
    }
  }

  /**
   * Invalidate guild settings when updated from the dashboard
   */
  async invalidateGuildSettings(guildId: string): Promise<void> {
    try {
      await this.redis.del(`guild:${guildId}:settings`);
    } catch (error) {
      // Ignore cache invalidation failures if Redis is down
    }
  }
}

export const cacheService = new CacheService();
