import { Redis } from 'ioredis';
import { logger } from '../utils/logger';

export class CacheService {
  public redis: Redis;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
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
    
    this.redis.on('error', (err) => {
      // Pass message and error separately so winston logs both
      logger.error(`Redis connection error: ${err.message}`, err);
    });
    
    this.redis.on('connect', () => {
      logger.info('Connected to Redis successfully');
    });
  }

  /**
   * Caches guild settings to prevent database spam on every message
   */
  async getGuildSettings(guildId: string, fetchFn: () => Promise<any>): Promise<any> {
    try {
      const cached = await this.redis.get(`guild:${guildId}:settings`);
      if (cached) {
        return JSON.parse(cached);
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
