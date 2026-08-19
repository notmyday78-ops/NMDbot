"use strict";
import os from "os";
import * as si from "systeminformation";
import { client } from "../../index";
import { getDatabase } from "../../database/connection";
import { economyTransactions, members, modCases, tickets, giveaways } from "../../database/schema";
import { sql, gte } from "drizzle-orm";
import { logger } from "../../utils/logger";
import { cacheManager, CacheTTL } from "../middleware/cache";
import { crossShardService } from "../../services/crossShardService";
class StatsAggregator {
  stats = null;
  updateInterval = null;
  intervalMs = 5e3;
  commandStats = {
    total: 0,
    today: 0,
    thisHour: 0,
    lastHourReset: Date.now(),
    lastDayReset: Date.now(),
    recentCommands: [],
    commandCounts: /* @__PURE__ */ new Map()
  };
  botStartTime = Date.now();
  lastUpdate = 0;
  /**
   * Start the aggregator with specified interval
   */
  start(intervalMs = 5e3) {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    this.intervalMs = intervalMs;
    this.updateStats();
    this.updateInterval = setInterval(() => {
      this.updateStats();
    }, intervalMs);
    logger.info(`Stats aggregator started with ${intervalMs}ms interval`);
  }
  /**
   * Stop the aggregator
   */
  stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    logger.info("Stats aggregator stopped");
  }
  /**
   * Update all statistics
   */
  async updateStats() {
    try {
      const startTime = Date.now();
      this.resetTimeBasedCounters();
      const [botStats, guildStats, userStats, commandStats, systemStats, featureStats] = await Promise.all([
        this.getBotStats(),
        this.getGuildStats(),
        this.getUserStats(),
        this.getCommandStats(),
        this.getSystemStats(),
        this.getFeatureStats()
      ]);
      this.stats = {
        bot: botStats,
        guilds: guildStats,
        users: userStats,
        commands: commandStats,
        system: systemStats,
        features: featureStats
      };
      cacheManager.set("stats:aggregated", this.stats, CacheTTL.STATS);
      this.lastUpdate = Date.now();
      const updateTime = Date.now() - startTime;
      const warningThreshold = Math.min(this.intervalMs * 0.8, 2e3);
      if (updateTime > warningThreshold) {
        logger.warn(`Stats aggregation took ${updateTime}ms (interval: ${this.intervalMs}ms)`);
      } else if (updateTime > this.intervalMs * 0.5) {
        logger.debug(`Stats aggregation took ${updateTime}ms`);
      }
    } catch (error) {
      logger.error("Error updating stats:", error);
    }
  }
  /**
   * Get bot statistics
   */
  async getBotStats() {
    const shardStats = await crossShardService.getShardStats(client);
    const avgPing = shardStats.length > 0 ? Math.round(
      shardStats.reduce((acc, s) => acc + (s.ping < 0 ? 0 : s.ping), 0) / shardStats.length
    ) : client.ws.ping;
    return {
      status: client.ws.status === 0 ? "online" : "connecting",
      uptime: Date.now() - this.botStartTime,
      startedAt: new Date(this.botStartTime).toISOString(),
      latency: avgPing,
      shardCount: client.shard?.count ?? client.ws.shards.size
    };
  }
  /**
   * Get guild statistics
   */
  async getGuildStats() {
    if (!crossShardService.isSharded(client)) {
      const guilds = client.guilds.cache;
      return {
        total: guilds.size,
        large: guilds.filter((g) => g.large).size,
        voiceActive: guilds.filter((g) => g.members.cache.some((m) => m.voice.channel)).size
      };
    }
    try {
      const results = await crossShardService.broadcastEval(client, (c) => {
        const guilds = c.guilds.cache;
        return {
          total: guilds.size,
          large: guilds.filter((g) => g.large).size,
          voiceActive: guilds.filter((g) => g.members.cache.some((m) => m.voice?.channel)).size
        };
      });
      return results.reduce(
        (acc, curr) => ({
          total: acc.total + curr.total,
          large: acc.large + curr.large,
          voiceActive: acc.voiceActive + curr.voiceActive
        }),
        { total: 0, large: 0, voiceActive: 0 }
      );
    } catch (error) {
      logger.error("Failed to aggregate sharded guild stats:", error);
      const guilds = client.guilds.cache;
      return {
        total: guilds.size,
        large: guilds.filter((g) => g.large).size,
        voiceActive: guilds.filter((g) => g.members.cache.some((m) => m.voice.channel)).size
      };
    }
  }
  /**
   * Get user statistics
   */
  async getUserStats() {
    const totalUsers = await crossShardService.getTotalUsersCount(client);
    let uniqueCount = 0;
    let onlineUsers = 0;
    if (!crossShardService.isSharded(client)) {
      const guilds = client.guilds.cache;
      const uniqueUsers = /* @__PURE__ */ new Set();
      guilds.forEach((guild) => {
        guild.members.cache.forEach((member) => {
          if (!member.user.bot) {
            uniqueUsers.add(member.user.id);
            if (member.presence?.status !== "offline") {
              onlineUsers++;
            }
          }
        });
      });
      uniqueCount = uniqueUsers.size;
    } else {
      try {
        const results = await crossShardService.broadcastEval(client, (c) => {
          const userSet = /* @__PURE__ */ new Set();
          let online = 0;
          c.guilds.cache.forEach((guild) => {
            guild.members.cache.forEach((member) => {
              if (!member.user.bot) {
                userSet.add(member.user.id);
                if (member.presence?.status !== "offline") {
                  online++;
                }
              }
            });
          });
          return { users: Array.from(userSet), online };
        });
        const globalUserSet = /* @__PURE__ */ new Set();
        for (const res of results) {
          onlineUsers += res.online;
          for (const id of res.users) {
            globalUserSet.add(id);
          }
        }
        uniqueCount = globalUserSet.size;
      } catch (error) {
        logger.error("Failed to aggregate sharded user stats:", error);
      }
    }
    let activeToday = 0;
    try {
      const db = getDatabase();
      const twentyFourHoursAgo = new Date(Date.now() - 864e5);
      const activeUsersResult = await db.select({ count: sql`COUNT(DISTINCT user_id)` }).from(members).where(gte(members.updatedAt, twentyFourHoursAgo)).execute();
      if (activeUsersResult[0]) {
        activeToday = Number(activeUsersResult[0].count) || 0;
      }
    } catch (error) {
      logger.debug("Failed to get active users from database");
    }
    return {
      total: totalUsers,
      unique: uniqueCount,
      activeToday,
      online: onlineUsers
    };
  }
  /**
   * Get command statistics
   */
  async getCommandStats() {
    const oneMinuteAgo = Date.now() - 6e4;
    const recentCommands = this.commandStats.recentCommands.filter((t) => t > oneMinuteAgo);
    this.commandStats.recentCommands = recentCommands;
    const topCommands = Array.from(this.commandStats.commandCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));
    return {
      totalExecuted: this.commandStats.total,
      today: this.commandStats.today,
      thisHour: this.commandStats.thisHour,
      perMinute: recentCommands.length,
      topCommands: topCommands.slice(0, 5)
    };
  }
  /**
   * Get system statistics
   */
  async getSystemStats() {
    const memTotal = os.totalmem();
    const memFree = os.freemem();
    const memUsage = memTotal - memFree;
    const cpuUsageData = await si.currentLoad().catch(() => ({ currentLoad: 0 }));
    return {
      memoryUsage: memUsage,
      memoryTotal: memTotal,
      cpuUsage: Math.round(cpuUsageData.currentLoad)
    };
  }
  /**
   * Get feature statistics
   */
  async getFeatureStats() {
    const stats = {
      economy: { active: 0, transactions: 0 },
      moderation: { cases: 0, activeWarnings: 0 },
      tickets: { open: 0, total: 0 },
      giveaways: { active: 0, participants: 0 },
      xp: { activeUsers: 0 }
    };
    try {
      const db = getDatabase();
      const sevenDaysAgo = new Date(Date.now() - 7 * 864e5);
      const [economyStats, moderationStats, ticketStats, giveawayStats, xpStats] = await Promise.all([
        // Economy stats
        db.select({
          transactions: sql`COUNT(*)`,
          active: sql`COUNT(DISTINCT user_id)`
        }).from(economyTransactions).where(gte(economyTransactions.createdAt, sevenDaysAgo)).execute(),
        // Moderation stats
        db.select({
          cases: sql`COUNT(*)`,
          warnings: sql`COUNT(*) FILTER (WHERE type = 'warn')`
        }).from(modCases).where(gte(modCases.createdAt, sevenDaysAgo)).execute(),
        // Ticket stats
        db.select({
          open: sql`COUNT(*) FILTER (WHERE status = 'open')`,
          total: sql`COUNT(*)`
        }).from(tickets).execute(),
        // Giveaway stats
        db.select({
          active: sql`COUNT(*) FILTER (WHERE status = 'active' AND end_time > NOW())`,
          total: sql`COUNT(*)`
        }).from(giveaways).execute(),
        // XP stats
        db.select({
          active: sql`COUNT(*) FILTER (WHERE updated_at > NOW() - INTERVAL '7 days')`
        }).from(members).execute()
      ]);
      if (economyStats[0]) {
        stats.economy.transactions = Number(economyStats[0].transactions) || 0;
        stats.economy.active = Number(economyStats[0].active) || 0;
      }
      if (moderationStats[0]) {
        stats.moderation.cases = Number(moderationStats[0].cases) || 0;
        stats.moderation.activeWarnings = Number(moderationStats[0].warnings) || 0;
      }
      if (ticketStats[0]) {
        stats.tickets.open = Number(ticketStats[0].open) || 0;
        stats.tickets.total = Number(ticketStats[0].total) || 0;
      }
      if (giveawayStats[0]) {
        stats.giveaways.active = Number(giveawayStats[0].active) || 0;
      }
      if (xpStats[0]) {
        stats.xp.activeUsers = Number(xpStats[0].active) || 0;
      }
    } catch (error) {
      logger.debug("Failed to get feature stats from database, using defaults");
    }
    return stats;
  }
  /**
   * Reset time-based counters
   */
  resetTimeBasedCounters() {
    const now = Date.now();
    if (now - this.commandStats.lastHourReset > 36e5) {
      this.commandStats.thisHour = 0;
      this.commandStats.lastHourReset = now;
    }
    if (now - this.commandStats.lastDayReset > 864e5) {
      this.commandStats.today = 0;
      this.commandStats.lastDayReset = now;
    }
  }
  /**
   * Increment command counter
   */
  incrementCommand(commandName) {
    this.commandStats.total++;
    this.commandStats.today++;
    this.commandStats.thisHour++;
    this.commandStats.recentCommands.push(Date.now());
    if (commandName) {
      const current = this.commandStats.commandCounts.get(commandName) || 0;
      this.commandStats.commandCounts.set(commandName, current + 1);
    }
    if (this.commandStats.recentCommands.length > 100) {
      const oneMinuteAgo = Date.now() - 6e4;
      this.commandStats.recentCommands = this.commandStats.recentCommands.filter(
        (t) => t > oneMinuteAgo
      );
    }
  }
  /**
   * Get current aggregated stats
   */
  getStats() {
    const cached = cacheManager.get("stats:aggregated");
    if (cached) {
      return cached;
    }
    return this.stats;
  }
  /**
   * Force refresh stats
   */
  async refresh() {
    await this.updateStats();
    return this.stats;
  }
  /**
   * Get stats age
   */
  getStatsAge() {
    return Date.now() - this.lastUpdate;
  }
}
export const statsAggregator = new StatsAggregator();
export function trackCommand(commandName) {
  statsAggregator.incrementCommand(commandName);
}
