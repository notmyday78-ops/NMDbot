"use strict";
import { Collection } from "discord.js";
import { logger } from "../utils/logger";
export const RateLimitConfigs = {
  // Global limits
  global: {
    command: { points: 10, duration: 60, blockDuration: 300 },
    // 10 commands per minute
    api: { points: 30, duration: 60, blockDuration: 600 }
    // 30 API calls per minute
  },
  // Per-command limits
  commands: {
    // Economy commands
    "economy.gamble": { points: 5, duration: 60, blockDuration: 300 },
    "economy.work": { points: 1, duration: 86400 },
    // Once per day
    "economy.daily": { points: 1, duration: 86400 },
    // Once per day
    "economy.rob": { points: 1, duration: 86400, blockDuration: 3600 },
    // Moderation commands
    "moderation.ban": { points: 5, duration: 300 },
    "moderation.kick": { points: 10, duration: 300 },
    "moderation.warn": { points: 20, duration: 300 },
    "moderation.purge": { points: 3, duration: 60 },
    // Utility commands
    "utility.help": { points: 5, duration: 60 },
    "utility.ping": { points: 10, duration: 60 },
    // Expensive operations
    "xp.leaderboard": { points: 3, duration: 60 },
    "giveaway.start": { points: 2, duration: 300 },
    "ticket.create": { points: 3, duration: 300 }
  },
  // Per-guild limits
  guild: {
    commands: { points: 100, duration: 60 },
    // 100 commands per minute per guild
    configChanges: { points: 10, duration: 300 },
    // 10 config changes per 5 minutes
    tickets: { points: 10, duration: 3600 }
    // 10 tickets per hour
  },
  // Anti-spam limits
  spam: {
    mentions: { points: 5, duration: 60, blockDuration: 3600 },
    // 5 mentions per minute
    links: { points: 10, duration: 60, blockDuration: 1800 },
    // 10 links per minute
    duplicates: { points: 3, duration: 60, blockDuration: 600 },
    // 3 duplicate messages
    capsLock: { points: 5, duration: 60, blockDuration: 300 }
    // 5 caps messages
  }
};
export class RateLimiter {
  memoryStorage;
  redis;
  constructor(redis) {
    this.memoryStorage = new Collection();
    this.redis = redis;
    setInterval(() => this.cleanup(), 6e4);
  }
  /**
   * Consumes points for a given key
   */
  async consume(key, points = 1, options) {
    const now = Date.now();
    const duration = options.duration * 1e3;
    const blockDuration = (options.blockDuration || 0) * 1e3;
    if (this.redis) {
      try {
        return await this.consumeRedis(key, points, options);
      } catch (error) {
        logger.error("Redis rate limit error, falling back to memory:", error);
      }
    }
    const data = this.memoryStorage.get(key);
    const expire = now + duration;
    if (data && data.expire > now && data.points < 0) {
      return {
        allowed: false,
        remainingPoints: 0,
        msBeforeNext: data.expire - now,
        consumedPoints: 0,
        isBlocked: true
      };
    }
    if (!data || data.expire <= now) {
      this.memoryStorage.set(key, { points: options.points - points, expire });
      return {
        allowed: true,
        remainingPoints: options.points - points,
        msBeforeNext: options.execEvenly ? duration / options.points : 0,
        consumedPoints: points,
        isBlocked: false
      };
    }
    if (data.points < points) {
      if (blockDuration > 0) {
        this.memoryStorage.set(key, { points: -1, expire: now + blockDuration });
      }
      return {
        allowed: false,
        remainingPoints: Math.max(0, data.points),
        msBeforeNext: data.expire - now,
        consumedPoints: 0,
        isBlocked: blockDuration > 0
      };
    }
    data.points -= points;
    return {
      allowed: true,
      remainingPoints: data.points,
      msBeforeNext: options.execEvenly ? duration / options.points : 0,
      consumedPoints: points,
      isBlocked: false
    };
  }
  /**
   * Redis-based rate limiting
   */
  async consumeRedis(key, points, options) {
    if (!this.redis) throw new Error("Redis not configured");
    const fullKey = `ratelimit:${key}`;
    const blockedKey = `${fullKey}:blocked`;
    const blockTtl = await this.redis.ttl(blockedKey);
    if (blockTtl > 0) {
      return {
        allowed: false,
        remainingPoints: 0,
        msBeforeNext: blockTtl * 1e3,
        consumedPoints: 0,
        isBlocked: true
      };
    }
    const luaScript = `
      local key = KEYS[1]
      local points_to_consume = tonumber(ARGV[1])
      local max_points = tonumber(ARGV[2])
      local duration = tonumber(ARGV[3])
      local block_duration = tonumber(ARGV[4])
      
      local current = redis.call('get', key)
      if current == false then
        redis.call('set', key, max_points - points_to_consume, 'EX', duration)
        return {1, max_points - points_to_consume}
      end
      
      local points = tonumber(current)
      if points < points_to_consume then
        if block_duration > 0 then
          redis.call('set', key .. ':blocked', '1', 'EX', block_duration)
        end
        return {0, points}
      end
      
      redis.call('decrby', key, points_to_consume)
      return {1, points - points_to_consume}
    `;
    const result = await this.redis.eval(
      luaScript,
      1,
      fullKey,
      points,
      options.points,
      options.duration,
      options.blockDuration || 0
    );
    const [allowed, remaining] = result;
    const ttl = await this.redis.ttl(fullKey);
    return {
      allowed: allowed === 1,
      remainingPoints: remaining,
      msBeforeNext: ttl > 0 ? ttl * 1e3 : 0,
      consumedPoints: allowed === 1 ? points : 0,
      isBlocked: allowed === 0 && options.blockDuration ? true : false
    };
  }
  /**
   * Reset rate limit for a key
   */
  async reset(key) {
    if (this.redis) {
      await this.redis.del(`ratelimit:${key}`, `ratelimit:${key}:blocked`);
    }
    this.memoryStorage.delete(key);
  }
  /**
   * Get current state for a key
   */
  async get(key, options) {
    return this.consume(key, 0, options);
  }
  /**
   * Clean up expired entries from memory
   */
  cleanup() {
    const now = Date.now();
    for (const [key, data] of this.memoryStorage) {
      if (data.expire <= now) {
        this.memoryStorage.delete(key);
      }
    }
  }
  /**
   * Create rate limit key
   */
  static createKey(type, ...identifiers) {
    return `${type}:${identifiers.join(":")}`;
  }
  /**
   * Check multiple rate limits
   */
  async checkLimits(limits) {
    for (const limit of limits) {
      const result = await this.consume(limit.key, limit.points || 1, limit.config);
      if (!result.allowed) {
        return false;
      }
    }
    return true;
  }
}
export const rateLimiter = new RateLimiter();
export async function checkCommandRateLimit(userId, guildId, commandName) {
  const limits = [
    // Global user limit
    {
      key: RateLimiter.createKey("global", userId),
      config: RateLimitConfigs.global.command
    },
    // Per-guild limit
    {
      key: RateLimiter.createKey("guild", guildId),
      config: RateLimitConfigs.guild.commands
    },
    // Per-command limit
    {
      key: RateLimiter.createKey("command", userId, commandName),
      config: RateLimitConfigs.commands[commandName] || RateLimitConfigs.global.command
    }
  ];
  for (const limit of limits) {
    const result = await rateLimiter.consume(limit.key, 1, limit.config);
    if (!result.allowed) {
      return result;
    }
  }
  return {
    allowed: true,
    remainingPoints: Infinity,
    msBeforeNext: 0,
    consumedPoints: 1,
    isBlocked: false
  };
}
