"use strict";
import { logger } from "../../utils/logger";
class RateLimiter {
  limits = /* @__PURE__ */ new Map();
  cleanupInterval;
  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanup(), 6e4);
  }
  /**
   * Create rate limit middleware
   */
  middleware(options) {
    const {
      windowMs,
      maxRequests,
      keyGenerator,
      skipSuccessfulRequests = false,
      skipFailedRequests = false,
      message = "Too many requests, please try again later"
    } = options;
    return (req, res, next) => {
      const key = keyGenerator ? keyGenerator(req) : this.defaultKeyGenerator(req);
      const now = Date.now();
      let entry = this.limits.get(key);
      if (!entry || now > entry.resetTime) {
        entry = {
          count: 0,
          resetTime: now + windowMs,
          firstRequest: now
        };
        this.limits.set(key, entry);
      }
      if (entry.count >= maxRequests) {
        const retryAfter = Math.ceil((entry.resetTime - now) / 1e3);
        res.setHeader("X-RateLimit-Limit", String(maxRequests));
        res.setHeader("X-RateLimit-Remaining", "0");
        res.setHeader("X-RateLimit-Reset", new Date(entry.resetTime).toISOString());
        res.setHeader("Retry-After", String(retryAfter));
        logger.warn(`Rate limit exceeded for ${key}: ${entry.count}/${maxRequests} requests`);
        res.status(429).json({
          error: "Too Many Requests",
          message,
          retryAfter
        });
        return;
      }
      const originalEnd = res.end;
      let counted = false;
      const originalEndTyped = originalEnd;
      res.end = function(chunk, encoding, callback) {
        if (!counted) {
          counted = true;
          const shouldCount = (!skipSuccessfulRequests || res.statusCode >= 400) && (!skipFailedRequests || res.statusCode < 400);
          if (shouldCount && entry) {
            entry.count++;
          }
        }
        if (typeof chunk === "function") {
          return originalEndTyped.call(res, chunk);
        } else if (typeof encoding === "function") {
          return originalEndTyped.call(res, chunk, encoding);
        } else if (callback) {
          return originalEndTyped.call(res, chunk, encoding, callback);
        } else {
          return originalEndTyped.call(res, chunk, encoding);
        }
      };
      res.setHeader("X-RateLimit-Limit", String(maxRequests));
      res.setHeader("X-RateLimit-Remaining", String(Math.max(0, maxRequests - entry.count - 1)));
      res.setHeader("X-RateLimit-Reset", new Date(entry.resetTime).toISOString());
      next();
    };
  }
  /**
   * Default key generator (IP + path)
   */
  defaultKeyGenerator(req) {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    return `${ip}:${req.path}`;
  }
  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of this.limits.entries()) {
      if (now > entry.resetTime + 6e4) {
        this.limits.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      logger.debug(`Rate limiter cleanup: removed ${cleaned} expired entries`);
    }
  }
  /**
   * Get current limits status
   */
  getStatus() {
    const now = Date.now();
    const activeKeys = Array.from(this.limits.values()).filter(
      (entry) => now <= entry.resetTime
    ).length;
    return {
      totalKeys: this.limits.size,
      activeKeys
    };
  }
  /**
   * Reset limits for a specific key
   */
  reset(key) {
    return this.limits.delete(key);
  }
  /**
   * Clear all limits
   */
  clear() {
    this.limits.clear();
  }
  /**
   * Destroy the rate limiter
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.limits.clear();
  }
}
const rateLimiter = new RateLimiter();
export const RateLimitPresets = {
  // Standard API rate limit (100 requests per minute)
  standard: {
    windowMs: 6e4,
    maxRequests: 100
  },
  // Strict rate limit (10 requests per minute)
  strict: {
    windowMs: 6e4,
    maxRequests: 10
  },
  // Per-guild rate limit (10 requests per second per guild)
  perGuild: {
    windowMs: 1e3,
    maxRequests: 10,
    keyGenerator: (req) => {
      const guildId = req.params.guildId || "unknown";
      const ip = req.ip || "unknown";
      return `guild:${guildId}:${ip}`;
    }
  },
  // Stats endpoint rate limit (matches dashboard refresh rate)
  stats: {
    windowMs: 500,
    maxRequests: 50,
    keyGenerator: (req) => {
      const ip = req.ip || "unknown";
      return `stats:${ip}`;
    }
  },
  // Heavy operation rate limit (1 request per 5 seconds)
  heavy: {
    windowMs: 5e3,
    maxRequests: 1
  }
};
export function createRateLimiter(options) {
  return rateLimiter.middleware(options);
}
export function guildRateLimiter(maxRequests = 10, windowMs = 1e3) {
  return rateLimiter.middleware({
    windowMs,
    maxRequests,
    keyGenerator: (req) => {
      const guildId = req.params.guildId || "unknown";
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      return `guild:${guildId}:${ip}`;
    },
    message: "Too many requests for this guild, please slow down"
  });
}
export function ipRateLimiter(maxRequests = 100, windowMs = 6e4) {
  return rateLimiter.middleware({
    windowMs,
    maxRequests,
    keyGenerator: (req) => {
      return req.ip || req.socket.remoteAddress || "unknown";
    }
  });
}
export function userRateLimiter(maxRequests = 50, windowMs = 6e4) {
  return rateLimiter.middleware({
    windowMs,
    maxRequests,
    keyGenerator: (req) => {
      const userId = req.userId || "anonymous";
      return `user:${userId}`;
    },
    message: "User rate limit exceeded, please wait before making more requests"
  });
}
export function getRateLimiterStatus() {
  return rateLimiter.getStatus();
}
export { rateLimiter };
