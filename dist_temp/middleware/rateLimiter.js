"use strict";
import { Collection } from "discord.js";
import { createHash } from "crypto";
import { logger } from "../utils/logger";
export const RateLimitPresets = {
  // Strict limits for sensitive operations
  moderation: {
    points: 5,
    duration: 60,
    blockDuration: 300
  },
  // Economy commands need throttling to prevent abuse
  economy: {
    points: 3,
    duration: 10,
    blockDuration: 60
  },
  // Gambling has stricter limits
  gambling: {
    points: 2,
    duration: 5,
    blockDuration: 120
  },
  // Rob command has special limits
  rob: {
    points: 1,
    duration: 86400,
    // Once per day
    blockDuration: 0
  },
  // Daily rewards
  daily: {
    points: 1,
    duration: 86400,
    blockDuration: 0
  },
  // General commands
  general: {
    points: 10,
    duration: 60,
    blockDuration: 0
  },
  // Utility commands
  utility: {
    points: 20,
    duration: 60,
    blockDuration: 0
  },
  // Config commands
  config: {
    points: 5,
    duration: 60,
    blockDuration: 120
  },
  // XP commands
  xp: {
    points: 10,
    duration: 30,
    blockDuration: 0
  },
  // Ticket operations
  ticket: {
    points: 3,
    duration: 60,
    blockDuration: 300
  },
  // API-heavy operations
  api: {
    points: 5,
    duration: 60,
    blockDuration: 120
  },
  // Message processing
  message: {
    points: 30,
    duration: 60,
    blockDuration: 0
  },
  // Voice state updates
  voice: {
    points: 20,
    duration: 60,
    blockDuration: 0
  },
  // Global rate limit (per user)
  global: {
    points: 50,
    duration: 60,
    blockDuration: 600
  },
  // Guild-wide rate limit
  guild: {
    points: 200,
    duration: 60,
    blockDuration: 300
  }
};
export class EnhancedRateLimiter {
  limits;
  blocked;
  warnings;
  constructor() {
    this.limits = new Collection();
    this.blocked = new Collection();
    this.warnings = new Collection();
    setInterval(() => this.cleanup(), 6e4);
  }
  /**
   * Check and consume rate limit points
   */
  consume(key, config = RateLimitPresets.general) {
    const hashedKey = this.hashKey(key);
    const fullKey = `${config.keyPrefix || "rl"}:${hashedKey}`;
    const blockExpiry = this.blocked.get(fullKey);
    if (blockExpiry && blockExpiry > Date.now()) {
      return {
        allowed: false,
        remainingPoints: 0,
        msBeforeNext: blockExpiry - Date.now(),
        consumedPoints: config.points,
        isBlocked: true
      };
    }
    let bucket = this.limits.get(fullKey);
    if (!bucket) {
      bucket = new RateLimitBucket(config);
      this.limits.set(fullKey, bucket);
    }
    const result = bucket.consume();
    if (!result.allowed && config.blockDuration) {
      const blockUntil = Date.now() + config.blockDuration * 1e3;
      this.blocked.set(fullKey, blockUntil);
      const warningKey = `warn:${hashedKey}`;
      const warnings = (this.warnings.get(warningKey) || 0) + 1;
      this.warnings.set(warningKey, warnings);
      if (warnings >= 3) {
        logger.warn(
          `Rate limit abuse detected for key: ${key.substring(0, 20)}... (${warnings} violations)`
        );
      }
      result.isBlocked = true;
      result.msBeforeNext = config.blockDuration * 1e3;
    }
    return result;
  }
  /**
   * Check rate limit without consuming
   */
  check(key, config = RateLimitPresets.general) {
    const hashedKey = this.hashKey(key);
    const fullKey = `${config.keyPrefix || "rl"}:${hashedKey}`;
    const blockExpiry = this.blocked.get(fullKey);
    if (blockExpiry && blockExpiry > Date.now()) {
      return {
        allowed: false,
        remainingPoints: 0,
        msBeforeNext: blockExpiry - Date.now(),
        consumedPoints: 0,
        isBlocked: true
      };
    }
    const bucket = this.limits.get(fullKey);
    if (!bucket) {
      return {
        allowed: true,
        remainingPoints: config.points,
        msBeforeNext: 0,
        consumedPoints: 0,
        isBlocked: false
      };
    }
    return bucket.check();
  }
  /**
   * Reset rate limit for a key
   */
  reset(key, prefix) {
    const hashedKey = this.hashKey(key);
    const fullKey = `${prefix || "rl"}:${hashedKey}`;
    this.limits.delete(fullKey);
    this.blocked.delete(fullKey);
    this.warnings.delete(`warn:${hashedKey}`);
  }
  /**
   * Get current status for a key
   */
  getStatus(key, prefix) {
    const hashedKey = this.hashKey(key);
    const fullKey = `${prefix || "rl"}:${hashedKey}`;
    return {
      limited: this.limits.has(fullKey),
      blocked: this.blocked.has(fullKey) && (this.blocked.get(fullKey) || 0) > Date.now(),
      warnings: this.warnings.get(`warn:${hashedKey}`) || 0,
      buckets: this.limits.filter((_, k) => k.includes(hashedKey)).size
    };
  }
  /**
   * Hash key for storage
   */
  hashKey(key) {
    return createHash("sha256").update(key).digest("hex").substring(0, 16);
  }
  /**
   * Cleanup expired entries
   */
  cleanup() {
    const now = Date.now();
    this.blocked.sweep((expiry) => expiry < now);
    this.limits.sweep((bucket) => bucket.isEmpty() && bucket.isExpired());
    const warningExpiry = now - 36e5;
    this.warnings.sweep((_, key) => {
      const bucket = this.limits.get(key.replace("warn:", "rl:"));
      return !bucket || bucket.lastAccess < warningExpiry;
    });
  }
}
class RateLimitBucket {
  constructor(config) {
    this.config = config;
    this.points = config.points;
    this.resetAt = Date.now() + config.duration * 1e3;
    this.lastAccess = Date.now();
  }
  points;
  resetAt;
  lastAccess;
  consume() {
    this.lastAccess = Date.now();
    this.checkReset();
    if (this.points <= 0) {
      return {
        allowed: false,
        remainingPoints: 0,
        msBeforeNext: this.resetAt - Date.now(),
        consumedPoints: 0,
        isBlocked: false
      };
    }
    this.points--;
    return {
      allowed: true,
      remainingPoints: this.points,
      msBeforeNext: this.config.execEvenly ? this.config.duration * 1e3 / this.config.points : 0,
      consumedPoints: 1,
      isBlocked: false
    };
  }
  check() {
    this.checkReset();
    return {
      allowed: this.points > 0,
      remainingPoints: this.points,
      msBeforeNext: this.points > 0 ? 0 : this.resetAt - Date.now(),
      consumedPoints: 0,
      isBlocked: false
    };
  }
  checkReset() {
    if (Date.now() >= this.resetAt) {
      this.points = this.config.points;
      this.resetAt = Date.now() + this.config.duration * 1e3;
    }
  }
  isEmpty() {
    return this.points === this.config.points;
  }
  isExpired() {
    return Date.now() > this.resetAt + 6e4;
  }
}
export class DistributedRateLimiter {
  limiter;
  constructor() {
    this.limiter = new EnhancedRateLimiter();
  }
  /**
   * Apply multiple rate limits in sequence
   */
  consumeMultiple(keys) {
    const results = [];
    for (const { key, config } of keys) {
      const result = this.limiter.consume(key, config);
      results.push(result);
      if (!result.allowed) {
        break;
      }
    }
    return results;
  }
  /**
   * Apply hierarchical rate limiting (user -> guild -> global)
   */
  consumeHierarchical(userId, guildId, commandName, commandConfig) {
    if (commandConfig) {
      const commandResult = this.limiter.consume(`cmd:${commandName}:${userId}`, commandConfig);
      if (!commandResult.allowed) {
        return { allowed: false, level: "command", result: commandResult };
      }
    }
    const userResult = this.limiter.consume(`user:${userId}`, RateLimitPresets.global);
    if (!userResult.allowed) {
      return { allowed: false, level: "user", result: userResult };
    }
    const guildResult = this.limiter.consume(`guild:${guildId}`, RateLimitPresets.guild);
    if (!guildResult.allowed) {
      return { allowed: false, level: "guild", result: guildResult };
    }
    const globalResult = this.limiter.consume("global", {
      points: 1e3,
      duration: 60,
      blockDuration: 300
    });
    if (!globalResult.allowed) {
      return { allowed: false, level: "global", result: globalResult };
    }
    return { allowed: true, result: userResult };
  }
  /**
   * Apply smart rate limiting with adaptive thresholds
   */
  consumeAdaptive(key, baseConfig, factors = {}) {
    let points = baseConfig.points;
    let blockDuration = baseConfig.blockDuration || 0;
    if (factors.trustScore !== void 0) {
      points = Math.floor(points * (1 + factors.trustScore));
    }
    if (factors.isPremium) {
      points *= 2;
    }
    if (factors.isStaff) {
      points *= 5;
      blockDuration = 0;
    }
    if (factors.accountAge !== void 0 && factors.accountAge < 7) {
      points = Math.floor(points * 0.5);
      blockDuration = blockDuration ? blockDuration * 2 : 60;
    }
    if (factors.previousViolations) {
      blockDuration = blockDuration * (1 + factors.previousViolations);
    }
    const adjustedConfig = {
      ...baseConfig,
      points,
      blockDuration
    };
    return this.limiter.consume(key, adjustedConfig);
  }
  /**
   * Get rate limiter instance
   */
  getInstance() {
    return this.limiter;
  }
}
export function applyRateLimit(userId, guildId, commandName, category) {
  let config = RateLimitPresets.general;
  if (category) {
    switch (category) {
      case "moderation":
        config = RateLimitPresets.moderation;
        break;
      case "economy":
        if (commandName === "rob") {
          config = RateLimitPresets.rob;
        } else if (commandName === "daily") {
          config = RateLimitPresets.daily;
        } else if (commandName.includes("gamble")) {
          config = RateLimitPresets.gambling;
        } else {
          config = RateLimitPresets.economy;
        }
        break;
      case "config":
        config = RateLimitPresets.config;
        break;
      case "ticket":
        config = RateLimitPresets.ticket;
        break;
      case "xp":
        config = RateLimitPresets.xp;
        break;
      case "utility":
        config = RateLimitPresets.utility;
        break;
    }
  }
  const result = rateLimiterInstance.consumeHierarchical(userId, guildId, commandName, config);
  if (!result.allowed) {
    logger.debug(
      `Rate limit hit for ${userId} in ${guildId} on ${commandName} (level: ${result.level})`
    );
  }
  return result.result;
}
export const rateLimiterInstance = new DistributedRateLimiter();
export default rateLimiterInstance;
