"use strict";
import { logger } from "../../utils/logger";
class CacheManager {
  cache = /* @__PURE__ */ new Map();
  stats = {
    hits: 0,
    misses: 0,
    size: 0,
    hitRate: 0
  };
  cleanupInterval;
  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanup(), 3e4);
  }
  /**
   * Get item from cache
   */
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }
    entry.hits++;
    this.stats.hits++;
    this.updateHitRate();
    return entry.data;
  }
  /**
   * Set item in cache
   */
  set(key, data, ttl) {
    const entry = {
      data,
      timestamp: Date.now(),
      ttl,
      hits: 0
    };
    this.cache.set(key, entry);
    this.stats.size = this.cache.size;
  }
  /**
   * Delete item from cache
   */
  delete(key) {
    const result = this.cache.delete(key);
    this.stats.size = this.cache.size;
    return result;
  }
  /**
   * Clear entire cache
   */
  clear() {
    this.cache.clear();
    this.stats.size = 0;
  }
  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    let deletedCount = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        deletedCount++;
      }
    }
    if (deletedCount > 0) {
      this.stats.size = this.cache.size;
      logger.debug(`Cache cleanup: removed ${deletedCount} expired entries`);
    }
  }
  /**
   * Update hit rate statistics
   */
  updateHitRate() {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total * 100 : 0;
  }
  /**
   * Get cache statistics
   */
  getStats() {
    return { ...this.stats };
  }
  /**
   * Invalidate cache entries by pattern
   */
  invalidatePattern(pattern) {
    let deletedCount = 0;
    const safePattern = this.buildSafePattern(pattern);
    if (!safePattern) {
      return 0;
    }
    let regex;
    try {
      regex = new RegExp(safePattern);
    } catch (error) {
      logger.warn(`Failed to compile cache invalidation pattern "${pattern}": ${error}`);
      return 0;
    }
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        deletedCount++;
      }
    }
    if (deletedCount > 0) {
      this.stats.size = this.cache.size;
      logger.debug(
        `Cache invalidation: removed ${deletedCount} entries matching pattern ${pattern}`
      );
    }
    return deletedCount;
  }
  /**
   * Build a safe regular expression from user-supplied patterns.
   * Supports "*" wildcard while escaping all other special characters.
   */
  buildSafePattern(pattern) {
    if (!pattern) {
      return null;
    }
    const trimmed = pattern.trim();
    if (!trimmed) {
      return null;
    }
    const limited = trimmed.slice(0, 256);
    const placeholder = "__WILDCARD__";
    const withPlaceholder = limited.replace(/\*/g, placeholder);
    const escaped = withPlaceholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return escaped.replace(new RegExp(placeholder, "g"), ".*");
  }
  /**
   * Stop cleanup interval
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}
export const cacheManager = new CacheManager();
export const CacheTTL = {
  STATS: 500,
  // 500ms for stats endpoints
  GUILD_DATA: 5e3,
  // 5 seconds for guild data
  MEMBER_LIST: 3e4,
  // 30 seconds for member lists
  SETTINGS: 1e4,
  // 10 seconds for settings
  ECONOMY: 2e3,
  // 2 seconds for economy data
  MODERATION: 3e3,
  // 3 seconds for moderation data
  TICKETS: 5e3,
  // 5 seconds for ticket data
  XP: 2e3,
  // 2 seconds for XP data
  GIVEAWAYS: 1e3,
  // 1 second for giveaways (real-time)
  DEFAULT: 5e3
  // Default 5 seconds
};
export function cacheMiddleware(ttl, keyGenerator) {
  return (req, res, next) => {
    if (req.method !== "GET") {
      next();
      return;
    }
    const cacheKey = keyGenerator ? keyGenerator(req) : `${req.method}:${req.originalUrl}`;
    const cachedData = cacheManager.get(cacheKey);
    if (cachedData !== null) {
      res.setHeader("X-Cache", "HIT");
      res.setHeader("X-Cache-TTL", String(ttl || CacheTTL.DEFAULT));
      res.json(cachedData);
      return;
    }
    const originalSend = res.json.bind(res);
    res.json = function(data) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const cacheTTL = ttl || CacheTTL.DEFAULT;
        cacheManager.set(cacheKey, data, cacheTTL);
        res.setHeader("X-Cache", "MISS");
        res.setHeader("X-Cache-TTL", String(cacheTTL));
      }
      return originalSend(data);
    };
    next();
  };
}
export function conditionalCache(shouldCache, ttl) {
  return (req, res, next) => {
    if (req.method !== "GET") {
      next();
      return;
    }
    const cacheKey = `${req.method}:${req.originalUrl}`;
    const cachedData = cacheManager.get(cacheKey);
    if (cachedData !== null) {
      res.setHeader("X-Cache", "HIT");
      res.json(cachedData);
      return;
    }
    const originalSend = res.json.bind(res);
    res.json = function(data) {
      if (res.statusCode >= 200 && res.statusCode < 300 && shouldCache(req, res, data)) {
        const cacheTTL = ttl || CacheTTL.DEFAULT;
        cacheManager.set(cacheKey, data, cacheTTL);
        res.setHeader("X-Cache", "MISS");
        res.setHeader("X-Cache-TTL", String(cacheTTL));
      } else {
        res.setHeader("X-Cache", "BYPASS");
      }
      return originalSend(data);
    };
    next();
  };
}
export function invalidateCache(pattern) {
  return (req, _res, next) => {
    const invalidationPattern = typeof pattern === "function" ? pattern(req) : pattern;
    const count = cacheManager.invalidatePattern(invalidationPattern);
    if (count > 0) {
      logger.debug(`Invalidated ${count} cache entries for pattern: ${invalidationPattern}`);
    }
    next();
  };
}
export function cacheStatsMiddleware(_req, res) {
  const stats = cacheManager.getStats();
  res.json({
    ...stats,
    hitRate: `${stats.hitRate.toFixed(2)}%`,
    memoryUsage: process.memoryUsage().heapUsed
  });
}
