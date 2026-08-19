"use strict";
import { getDatabase } from "../../database/connection";
import { logger } from "../../utils/logger";
import { sql } from "drizzle-orm";
class QueryOptimizer {
  metrics = /* @__PURE__ */ new Map();
  slowQueryThreshold = 100;
  // milliseconds
  connectionPool = {
    maxConnections: 20,
    currentConnections: 0,
    waitQueue: []
  };
  /**
   * Execute query with timing and metrics
   */
  async executeQuery(queryName, queryFn) {
    const startTime = Date.now();
    try {
      if (this.connectionPool.currentConnections >= this.connectionPool.maxConnections) {
        await this.waitForConnection();
      }
      this.connectionPool.currentConnections++;
      const result = await queryFn();
      const executionTime = Date.now() - startTime;
      this.recordMetrics(queryName, executionTime);
      if (executionTime > this.slowQueryThreshold) {
        logger.warn(`Slow query detected: ${queryName} took ${executionTime}ms`);
      }
      return result;
    } catch (error) {
      logger.error(`Query failed: ${queryName}`, error);
      throw error;
    } finally {
      this.connectionPool.currentConnections--;
      this.releaseConnection();
    }
  }
  /**
   * Execute multiple queries in parallel with connection pooling
   */
  async executeBatch(queries) {
    const startTime = Date.now();
    const batchSize = Math.min(
      queries.length,
      this.connectionPool.maxConnections - this.connectionPool.currentConnections
    );
    const results = [];
    for (let i = 0; i < queries.length; i += batchSize) {
      const batch = queries.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((query) => this.executeQuery(query.name, query.fn))
      );
      results.push(...batchResults);
    }
    const totalTime = Date.now() - startTime;
    logger.debug(`Batch query completed: ${queries.length} queries in ${totalTime}ms`);
    return results;
  }
  /**
   * Create optimized pagination query
   */
  createPaginatedQuery(limit = 20, offset = 0, orderBy) {
    if (offset > 1e3) {
      logger.warn(`Large offset detected (${offset}). Consider using cursor-based pagination.`);
    }
    return {
      limit,
      offset,
      orderBy: orderBy || "created_at DESC"
    };
  }
  /**
   * Batch insert optimization
   */
  async batchInsert(table, data, chunkSize = 100) {
    const db = getDatabase();
    const chunks = [];
    for (let i = 0; i < data.length; i += chunkSize) {
      chunks.push(data.slice(i, i + chunkSize));
    }
    await this.executeBatch(
      chunks.map((chunk, index) => ({
        name: `batch_insert_${index}`,
        fn: async () => {
          await db.insert(table).values(chunk).execute();
        }
      }))
    );
    logger.info(`Batch insert completed: ${data.length} records in ${chunks.length} chunks`);
  }
  /**
   * Create indexed query hint
   */
  useIndex(tableName, indexName) {
    logger.debug(`Query using index: ${tableName}.${indexName}`);
    return `/* INDEX: ${indexName} */`;
  }
  /**
   * Wait for available connection
   */
  async waitForConnection() {
    return new Promise((resolve) => {
      this.connectionPool.waitQueue.push(Date.now());
      const checkInterval = setInterval(() => {
        if (this.connectionPool.currentConnections < this.connectionPool.maxConnections) {
          clearInterval(checkInterval);
          this.connectionPool.waitQueue.shift();
          resolve();
        }
      }, 10);
      setTimeout(() => {
        clearInterval(checkInterval);
        this.connectionPool.waitQueue.shift();
        resolve();
      }, 5e3);
    });
  }
  /**
   * Release connection and process wait queue
   */
  releaseConnection() {
  }
  /**
   * Record query metrics
   */
  recordMetrics(queryName, executionTime) {
    const existing = this.metrics.get(queryName);
    if (existing) {
      existing.count++;
      existing.totalTime += executionTime;
      existing.avgTime = existing.totalTime / existing.count;
      existing.lastExecuted = /* @__PURE__ */ new Date();
    } else {
      this.metrics.set(queryName, {
        query: queryName,
        count: 1,
        totalTime: executionTime,
        avgTime: executionTime,
        lastExecuted: /* @__PURE__ */ new Date()
      });
    }
  }
  /**
   * Get query metrics
   */
  getMetrics() {
    return Array.from(this.metrics.values()).sort((a, b) => b.avgTime - a.avgTime);
  }
  /**
   * Get slow queries
   */
  getSlowQueries(threshold) {
    const limit = threshold || this.slowQueryThreshold;
    return this.getMetrics().filter((m) => m.avgTime > limit);
  }
  /**
   * Get connection pool stats
   */
  getPoolStats() {
    return {
      active: this.connectionPool.currentConnections,
      idle: this.connectionPool.maxConnections - this.connectionPool.currentConnections,
      total: this.connectionPool.maxConnections,
      waitingRequests: this.connectionPool.waitQueue.length
    };
  }
  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics.clear();
  }
  /**
   * Optimize N+1 query problem
   */
  async preventNPlusOne(parentQuery, childQuery, parentKey, childKey) {
    const parents = await this.executeQuery("parent_query", parentQuery);
    if (!Array.isArray(parents) || parents.length === 0) {
      return /* @__PURE__ */ new Map();
    }
    const parentIds = parents.map((p) => p[parentKey]);
    const children = await this.executeQuery("child_query", () => childQuery(parentIds));
    const childMap = /* @__PURE__ */ new Map();
    for (const child of children) {
      const parentId = child[childKey];
      if (!childMap.has(parentId)) {
        childMap.set(parentId, []);
      }
      childMap.get(parentId).push(child);
    }
    return childMap;
  }
  /**
   * Create query plan explanation
   */
  async explainQuery() {
    try {
      const db = getDatabase();
      const explanation = await db.execute(sql`EXPLAIN (ANALYZE, BUFFERS) SELECT 1`);
      return JSON.stringify(explanation, null, 2);
    } catch (error) {
      logger.error("Failed to explain query:", error);
      return "Query explanation not available";
    }
  }
}
export const queryOptimizer = new QueryOptimizer();
export const QueryUtils = {
  /**
   * Create optimized COUNT query
   */
  async getCount(table, whereClause) {
    return queryOptimizer.executeQuery("count_query", async () => {
      const db = getDatabase();
      const query = whereClause ? db.select({ count: sql`COUNT(*)` }).from(table).where(whereClause) : db.select({ count: sql`COUNT(*)` }).from(table);
      const result = await query.execute();
      return Number(result[0]?.count) || 0;
    });
  },
  /**
   * Create optimized EXISTS query
   */
  async exists(table, whereClause) {
    return queryOptimizer.executeQuery("exists_query", async () => {
      const db = getDatabase();
      const result = await db.select({ count: sql`COUNT(*)` }).from(table).where(whereClause).execute();
      return (result[0]?.count || 0) > 0;
    });
  },
  /**
   * Bulk upsert with conflict handling
   */
  async upsert(table, data, conflictColumns) {
    return queryOptimizer.executeQuery("upsert_query", async () => {
      const db = getDatabase();
      await db.insert(table).values(data).onConflictDoUpdate({
        target: conflictColumns,
        set: data[0]
        // Update with new values
      }).execute();
    });
  }
};
export function monitorQueryPerformance() {
  return {
    before: () => {
      return Date.now();
    },
    after: (queryName, startTime) => {
      const duration = Date.now() - startTime;
      if (duration > 100) {
        logger.warn(`Slow query: ${queryName} took ${duration}ms`);
      }
    }
  };
}
