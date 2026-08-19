"use strict";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { logger } from "../utils/logger";
const connectionString = process.env.DATABASE_URL || "postgresql://localhost/pegasus";
const maxConnections = parseInt(process.env.DB_MAX_CONNECTIONS || "20", 10);
const queryClient = postgres(connectionString, {
  max: maxConnections,
  idle_timeout: 0,
  // Disable client-side idle timeout to prevent TimeoutNegativeWarning in Node 24+
  connect_timeout: 30,
  // Increased timeout for better resilience with Neon serverless pooler
  fetch_types: false,
  // Prevents custom type fetching on connection initialization, saving extra round-trips to Neon pooler
  // Connection pool settings optimized for Discord bot workloads
  prepare: true,
  // Prepared statements for better performance
  ssl: connectionString.includes("sslmode=require") || connectionString.includes(".neon.tech") ? "require" : process.env.DB_SSL === "false" ? false : "require",
  // Error handling
  onnotice: (notice) => {
    if (true) {
      logger.debug("Database notice:", notice);
    }
  },
  // Transform options for BigInt handling
  transform: {
    undefined: null
    // Convert undefined to null
  },
  // Types configuration for proper BigInt handling
  types: {
    bigint: postgres.BigInt
  }
});
export const db = drizzle(queryClient, {
  schema,
  logger: true
});
export * from "./schema";
export async function checkDatabaseConnection() {
  try {
    await queryClient`SELECT 1`;
    logger.info("Database connection established successfully");
    return true;
  } catch (error) {
    logger.error("Failed to connect to database:", error);
    return false;
  }
}
export async function closeDatabaseConnection() {
  try {
    await queryClient.end();
    logger.info("Database connection closed");
  } catch (error) {
    logger.error("Error closing database connection:", error);
  }
}
export async function withTransaction(callback, retries = 3) {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      return await db.transaction(async (tx) => {
        return await callback(tx);
      });
    } catch (error) {
      lastError = error;
      if (error instanceof Error && (error.message.includes("constraint") || error.message.includes("duplicate") || error.message.includes("violates"))) {
        throw error;
      }
      if (i < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, i) * 100));
      }
    }
  }
  throw lastError || new Error("Transaction failed after retries");
}
export function createQueryTimer(queryName) {
  const startTime = process.hrtime.bigint();
  return {
    end: () => {
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1e6;
      if (duration > 1e3) {
        logger.warn(`Slow query detected: ${queryName} took ${duration.toFixed(2)}ms`);
      } else if (true) {
        logger.debug(`Query ${queryName} took ${duration.toFixed(2)}ms`);
      }
    }
  };
}
export function toDiscordId(value) {
  return value.toString();
}
export function fromDiscordId(value) {
  return BigInt(value);
}
export async function batchInsert(table, data, batchSize = 1e3) {
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    await db.insert(table).values(batch);
  }
}
