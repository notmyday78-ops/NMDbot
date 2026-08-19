"use strict";
import { db, createQueryTimer, withTransaction } from "../database";
import { logger } from "../utils/logger";
export class BaseRepository {
  db = db;
  logger = logger;
  /**
   * Execute a query with performance monitoring
   */
  async executeQuery(queryName, queryFn) {
    const timer = createQueryTimer(queryName);
    try {
      const result = await queryFn();
      timer.end();
      return result;
    } catch (error) {
      timer.end();
      this.logger.error(`Query ${queryName} failed:`, error);
      throw error;
    }
  }
  /**
   * Execute a transaction with retry logic
   */
  async executeTransaction(transactionFn, retries = 3) {
    return withTransaction(transactionFn, retries);
  }
  /**
   * Batch operation helper
   */
  async batchOperation(items, batchSize, operation) {
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      await operation(batch);
    }
  }
  /**
   * Safe Discord ID conversion
   */
  toDiscordId(value) {
    return value.toString();
  }
  fromDiscordId(value) {
    return BigInt(value);
  }
  /**
   * Get current timestamp
   */
  now() {
    return /* @__PURE__ */ new Date();
  }
  /**
   * Check if a timestamp has expired
   */
  hasExpired(timestamp) {
    if (!timestamp) return false;
    return /* @__PURE__ */ new Date() > timestamp;
  }
}
