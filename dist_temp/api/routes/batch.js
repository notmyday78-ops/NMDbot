"use strict";
import { Router } from "express";
import { client } from "../../index";
import { getDatabase } from "../../database/connection";
import {
  guilds as guildsTable,
  guildSettings,
  members,
  economyBalances
} from "../../database/schema";
import { inArray, desc, eq, sql } from "drizzle-orm";
import { logger } from "../../utils/logger";
import { cacheManager, CacheTTL } from "../middleware/cache";
import { crossShardService } from "../../services/crossShardService";
const router = Router();
router.post("/guilds", async (req, res) => {
  try {
    if (!req.body || typeof req.body !== "object") {
      res.status(400).json({ error: "Bad Request", message: "Invalid request body" });
      return;
    }
    const { guildIds, fields = ["basic", "features"] } = req.body;
    if (!guildIds || !Array.isArray(guildIds) || guildIds.length === 0) {
      res.status(400).json({
        error: "Bad Request",
        message: "guildIds array is required"
      });
      return;
    }
    if (guildIds.length > 50) {
      res.status(400).json({
        error: "Bad Request",
        message: "Maximum 50 guilds per batch request"
      });
      return;
    }
    const results = [];
    const db = getDatabase();
    const uncachedGuildIds = [];
    for (const guildId of guildIds) {
      const cacheKey = `batch:guild:${guildId}`;
      const cached = cacheManager.get(cacheKey);
      if (cached) {
        results.push(cached);
      } else {
        uncachedGuildIds.push(guildId);
      }
    }
    if (uncachedGuildIds.length > 0) {
      let discordGuilds = [];
      if (crossShardService.isSharded(client)) {
        const nestedGuilds = await crossShardService.broadcastEval(
          client,
          (c, { ids }) => {
            return ids.map((id) => {
              const guild = c.guilds.cache.get(id);
              if (!guild) return null;
              const onlineMembers = guild.members.cache.filter(
                (m) => m.presence?.status !== "offline"
              );
              return {
                id: guild.id,
                name: guild.name,
                icon: guild.icon,
                memberCount: guild.memberCount,
                onlineCount: onlineMembers.size
              };
            }).filter(Boolean);
          },
          { ids: uncachedGuildIds }
        );
        discordGuilds = nestedGuilds.flat();
      } else {
        discordGuilds = uncachedGuildIds.map((id) => {
          const guild = client.guilds.cache.get(id);
          if (!guild) return null;
          const onlineMembers = guild.members.cache.filter((m) => m.presence?.status !== "offline");
          return {
            id: guild.id,
            name: guild.name,
            icon: guild.icon,
            memberCount: guild.memberCount,
            onlineCount: onlineMembers.size
          };
        }).filter(Boolean);
      }
      const [dbGuilds, dbSettings] = await Promise.all([
        db.select().from(guildsTable).where(inArray(guildsTable.id, uncachedGuildIds)).execute(),
        db.select().from(guildSettings).where(inArray(guildSettings.guildId, uncachedGuildIds)).execute()
      ]);
      const settingsMap = new Map(dbSettings.map((s) => [s.guildId, s]));
      const dbGuildMap = new Map(dbGuilds.map((g) => [g.id, g]));
      const statsMap = /* @__PURE__ */ new Map();
      if (fields.includes("stats")) {
        const memberStats = await db.select({
          guildId: members.guildId,
          totalMembers: sql`COUNT(*)`,
          activeMembers: sql`COUNT(*) FILTER (WHERE ${members.updatedAt} > NOW() - INTERVAL '7 days')`
        }).from(members).where(inArray(members.guildId, uncachedGuildIds)).groupBy(members.guildId).execute();
        const economyStats = await db.select({
          guildId: economyBalances.guildId,
          totalBalance: sql`SUM(balance + bank_balance)`
        }).from(economyBalances).where(inArray(economyBalances.guildId, uncachedGuildIds)).groupBy(economyBalances.guildId).execute();
        memberStats.forEach((stat) => {
          statsMap.set(stat.guildId, {
            totalMembers: Number(stat.totalMembers) || 0,
            activeMembers: Number(stat.activeMembers) || 0
          });
        });
        economyStats.forEach((stat) => {
          const existing = statsMap.get(stat.guildId) || {};
          statsMap.set(stat.guildId, {
            ...existing,
            economyBalance: Number(stat.totalBalance) || 0
          });
        });
      }
      for (const discordGuild of discordGuilds) {
        if (!discordGuild) continue;
        const dbGuild = dbGuildMap.get(discordGuild.id);
        const settings = settingsMap.get(discordGuild.id);
        const stats = statsMap.get(discordGuild.id);
        const guildSummary = {
          id: discordGuild.id,
          name: discordGuild.name,
          icon: discordGuild.icon,
          memberCount: discordGuild.memberCount,
          onlineCount: discordGuild.onlineCount,
          features: {
            economy: true,
            // Default enabled, would need separate feature flags table
            moderation: true,
            tickets: true,
            xp: settings?.xpEnabled ?? true,
            giveaways: true
          }
        };
        if (fields.includes("settings")) {
          guildSummary.settings = {
            prefix: dbGuild?.prefix || "!",
            language: dbGuild?.language || "en"
          };
        }
        if (fields.includes("stats") && stats) {
          guildSummary.stats = stats;
        }
        const cacheKey = `batch:guild:${discordGuild.id}`;
        cacheManager.set(cacheKey, guildSummary, CacheTTL.GUILD_DATA);
        results.push(guildSummary);
      }
    }
    res.json({
      guilds: results,
      total: results.length,
      cached: guildIds.length - uncachedGuildIds.length
    });
  } catch (error) {
    logger.error("Error in batch guild request:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch batch guild data"
    });
  }
});
router.post("/members", async (req, res) => {
  try {
    if (!req.body || typeof req.body !== "object") {
      res.status(400).json({ error: "Bad Request", message: "Invalid request body" });
      return;
    }
    const { guildIds, limit = 10 } = req.body;
    if (!guildIds || !Array.isArray(guildIds) || guildIds.length === 0) {
      res.status(400).json({
        error: "Bad Request",
        message: "guildIds array is required"
      });
      return;
    }
    if (guildIds.length > 20) {
      res.status(400).json({
        error: "Bad Request",
        message: "Maximum 20 guilds per batch request"
      });
      return;
    }
    const db = getDatabase();
    const results = {};
    await Promise.all(
      guildIds.map(async (guildId) => {
        const topMembers = await db.select({
          userId: members.userId,
          xp: members.xp,
          level: members.level,
          messages: members.messages
        }).from(members).where(eq(members.guildId, guildId)).orderBy(desc(members.xp)).limit(limit).execute();
        results[guildId] = topMembers.map((m) => ({
          userId: m.userId,
          xp: m.xp || 0,
          level: m.level || 0,
          messages: m.messages || 0
        }));
      })
    );
    res.json({
      guilds: results,
      total: Object.keys(results).length
    });
  } catch (error) {
    logger.error("Error in batch members request:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch batch member data"
    });
  }
});
router.post("/stats", async (req, res) => {
  try {
    if (!req.body || typeof req.body !== "object") {
      res.status(400).json({ error: "Bad Request", message: "Invalid request body" });
      return;
    }
    const { guildIds } = req.body;
    if (!guildIds || !Array.isArray(guildIds) || guildIds.length === 0) {
      res.status(400).json({
        error: "Bad Request",
        message: "guildIds array is required"
      });
      return;
    }
    if (guildIds.length > 30) {
      res.status(400).json({
        error: "Bad Request",
        message: "Maximum 30 guilds per batch request"
      });
      return;
    }
    const results = {};
    const uncachedGuildIds = [];
    for (const guildId of guildIds) {
      const cacheKey = `batch:stats:${guildId}`;
      const cached = cacheManager.get(cacheKey);
      if (cached) {
        results[guildId] = cached;
      } else {
        uncachedGuildIds.push(guildId);
      }
    }
    if (uncachedGuildIds.length > 0) {
      let statsArray = [];
      if (crossShardService.isSharded(client)) {
        const nestedStats = await crossShardService.broadcastEval(
          client,
          (c, { ids }) => {
            return ids.map((id) => {
              const guild = c.guilds.cache.get(id);
              if (!guild) return null;
              return {
                guildId: id,
                memberCount: guild.memberCount,
                onlineCount: guild.members.cache.filter(
                  (m) => m.presence?.status !== "offline"
                ).size,
                boostLevel: guild.premiumTier,
                boostCount: guild.premiumSubscriptionCount || 0,
                channelCount: guild.channels.cache.size,
                roleCount: guild.roles.cache.size
              };
            }).filter(Boolean);
          },
          { ids: uncachedGuildIds }
        );
        statsArray = nestedStats.flat();
      } else {
        statsArray = uncachedGuildIds.map((id) => {
          const guild = client.guilds.cache.get(id);
          if (!guild) return null;
          return {
            guildId: id,
            memberCount: guild.memberCount,
            onlineCount: guild.members.cache.filter((m) => m.presence?.status !== "offline").size,
            boostLevel: guild.premiumTier,
            boostCount: guild.premiumSubscriptionCount || 0,
            channelCount: guild.channels.cache.size,
            roleCount: guild.roles.cache.size
          };
        }).filter(Boolean);
      }
      for (const stat of statsArray) {
        const guildId = stat.guildId;
        delete stat.guildId;
        cacheManager.set(`batch:stats:${guildId}`, stat, CacheTTL.GUILD_DATA);
        results[guildId] = stat;
      }
    }
    res.json({
      guilds: results,
      total: Object.keys(results).length
    });
  } catch (error) {
    logger.error("Error in batch stats request:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch batch stats"
    });
  }
});
export const batchRouter = router;
