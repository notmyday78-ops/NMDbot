"use strict";
import { logger } from "../utils/logger";
const STATUS_NAMES = [
  "READY",
  "CONNECTING",
  "RECONNECTING",
  "IDLE",
  "NEARLY",
  "DISCONNECTED",
  "WAITING_FOR_GUILDS",
  "IDENTIFYING",
  "RESUMING"
];
export class CrossShardService {
  /**
   * Check if client is running in sharded mode via ShardingManager
   */
  isSharded(client) {
    return Boolean(client.shard && client.shard.count > 0);
  }
  /**
   * Get current shard ID for this client instance
   */
  getCurrentShardId(client) {
    return client.shard?.ids[0] ?? 0;
  }
  /**
   * Calculate which shard handles a specific guild ID based on Discord's sharding formula
   */
  getShardIdForGuild(guildId, totalShards) {
    try {
      return Number((BigInt(guildId) >> 22n) % BigInt(totalShards));
    } catch {
      return 0;
    }
  }
  /**
   * Broadcast an evaluation function to all shards
   */
  async broadcastEval(client, fn, context) {
    if (!this.isSharded(client)) {
      const result = await fn(client, context);
      return [result];
    }
    try {
      return await client.shard.broadcastEval(fn, {
        context
      });
    } catch (error) {
      logger.error("Failed to broadcastEval across shards:", error);
      throw error;
    }
  }
  /**
   * Fetch detailed stats for all shards
   */
  async getShardStats(client) {
    if (!this.isSharded(client)) {
      const mem = process.memoryUsage().heapUsed;
      const guilds = client.guilds.cache;
      const userCount = Array.from(guilds.values()).reduce(
        (acc, g) => acc + (g.memberCount || 0),
        0
      );
      return [
        {
          id: 0,
          status: client.ws.status,
          statusText: STATUS_NAMES[client.ws.status] || "UNKNOWN",
          ping: client.ws.ping,
          guildCount: guilds.size,
          userCount,
          uptime: client.uptime || 0,
          memoryUsage: mem
        }
      ];
    }
    try {
      const shardResults = await client.shard.broadcastEval((c) => {
        const mem = process.memoryUsage().heapUsed;
        const guilds = c.guilds.cache;
        const userCount = Array.from(guilds.values()).reduce(
          (acc, g) => acc + (g.memberCount || 0),
          0
        );
        return {
          id: c.shard?.ids[0] ?? 0,
          status: c.ws.status,
          ping: c.ws.ping,
          guildCount: guilds.size,
          userCount,
          uptime: c.uptime || 0,
          memoryUsage: mem
        };
      });
      return shardResults.map((s) => ({
        ...s,
        statusText: STATUS_NAMES[s.status] || "UNKNOWN"
      }));
    } catch (error) {
      logger.error("Error fetching shard stats:", error);
      return [];
    }
  }
  /**
   * Fetch total guild count across all shards
   */
  async getTotalGuildsCount(client) {
    if (!this.isSharded(client)) {
      return client.guilds.cache.size;
    }
    try {
      const counts = await client.shard.fetchClientValues("guilds.cache.size");
      return counts.reduce((acc, count) => acc + count, 0);
    } catch (error) {
      logger.error("Failed to fetch total guild count across shards:", error);
      return client.guilds.cache.size;
    }
  }
  /**
   * Fetch total user count (sum of all guild memberCounts) across all shards
   */
  async getTotalUsersCount(client) {
    if (!this.isSharded(client)) {
      return Array.from(client.guilds.cache.values()).reduce(
        (acc, g) => acc + (g.memberCount || 0),
        0
      );
    }
    try {
      const counts = await client.shard.broadcastEval(
        (c) => Array.from(c.guilds.cache.values()).reduce(
          (acc, g) => acc + (g.memberCount || 0),
          0
        )
      );
      return counts.reduce((acc, count) => acc + count, 0);
    } catch (error) {
      logger.error("Failed to fetch total user count across shards:", error);
      return Array.from(client.guilds.cache.values()).reduce(
        (acc, g) => acc + (g.memberCount || 0),
        0
      );
    }
  }
  /**
   * Fetch count of unique user IDs cached across all shards
   */
  async getUniqueUsersCount(client) {
    if (!this.isSharded(client)) {
      const unique = /* @__PURE__ */ new Set();
      client.guilds.cache.forEach((g) => {
        g.members.cache.forEach((m) => unique.add(m.id));
      });
      return unique.size;
    }
    try {
      const userArrays = await client.shard.broadcastEval((c) => {
        const set = /* @__PURE__ */ new Set();
        c.guilds.cache.forEach((g) => {
          g.members.cache.forEach((m) => set.add(m.id));
        });
        return Array.from(set);
      });
      const globalSet = /* @__PURE__ */ new Set();
      for (const arr of userArrays) {
        for (const id of arr) {
          globalSet.add(id);
        }
      }
      return globalSet.size;
    } catch (error) {
      logger.error("Failed to fetch unique user count across shards:", error);
      return 0;
    }
  }
  /**
   * Fetch total channels count across all shards
   */
  async getTotalChannelsCount(client) {
    if (!this.isSharded(client)) {
      return Array.from(client.guilds.cache.values()).reduce(
        (acc, g) => acc + (g.channels?.cache?.size || 0),
        0
      );
    }
    try {
      const counts = await client.shard.broadcastEval(
        (c) => Array.from(c.guilds.cache.values()).reduce(
          (acc, g) => acc + (g.channels?.cache?.size || 0),
          0
        )
      );
      return counts.reduce((acc, count) => acc + count, 0);
    } catch (error) {
      logger.error("Failed to fetch total channel count across shards:", error);
      return Array.from(client.guilds.cache.values()).reduce(
        (acc, g) => acc + (g.channels?.cache?.size || 0),
        0
      );
    }
  }
  /**
   * Fetch a guild by ID across all shards
   */
  async fetchGuild(client, guildId) {
    const localGuild = client.guilds.cache.get(guildId);
    if (localGuild) {
      return this.serializeGuild(localGuild, client.shard?.ids[0] ?? 0);
    }
    if (!this.isSharded(client)) {
      return null;
    }
    try {
      const results = await client.shard.broadcastEval(
        (c, { gId }) => {
          const g = c.guilds.cache.get(gId);
          if (!g) return null;
          return {
            id: g.id,
            name: g.name,
            icon: g.icon,
            memberCount: g.memberCount,
            ownerId: g.ownerId,
            shardId: c.shard?.ids[0] ?? 0,
            joinedAt: g.joinedAt?.toISOString() || null,
            banner: g.banner,
            description: g.description,
            features: Array.from(g.features),
            large: g.large,
            vanityURLCode: g.vanityURLCode
          };
        },
        { context: { gId: guildId } }
      );
      return results.find((g) => g !== null) || null;
    } catch (error) {
      logger.error(`Error fetching cross-shard guild ${guildId}:`, error);
      return null;
    }
  }
  /**
   * Fetch summary list of all guilds across all shards
   */
  async fetchAllGuilds(client) {
    if (!this.isSharded(client)) {
      const currentShardId = client.shard?.ids[0] ?? 0;
      return client.guilds.cache.map((g) => this.serializeGuild(g, currentShardId));
    }
    try {
      const nestedGuilds = await client.shard.broadcastEval((c) => {
        const sId = c.shard?.ids[0] ?? 0;
        return c.guilds.cache.map((g) => ({
          id: g.id,
          name: g.name,
          icon: g.icon,
          memberCount: g.memberCount,
          ownerId: g.ownerId,
          shardId: sId,
          joinedAt: g.joinedAt?.toISOString() || null,
          banner: g.banner,
          description: g.description,
          features: Array.from(g.features),
          large: g.large,
          vanityURLCode: g.vanityURLCode
        }));
      });
      return nestedGuilds.flat();
    } catch (error) {
      logger.error("Error fetching all guilds across shards:", error);
      return client.guilds.cache.map((g) => this.serializeGuild(g, 0));
    }
  }
  /**
   * Fetch a user by ID across all shards or from Discord API
   */
  async fetchUser(client, userId) {
    const localUser = client.users.cache.get(userId);
    if (localUser) {
      return this.serializeUser(localUser);
    }
    if (this.isSharded(client)) {
      try {
        const results = await client.shard.broadcastEval(
          (c, { uId }) => {
            const u = c.users.cache.get(uId);
            if (!u) return null;
            return {
              id: u.id,
              username: u.username,
              discriminator: u.discriminator,
              avatar: u.avatar,
              tag: u.tag,
              bot: u.bot
            };
          },
          { context: { uId: userId } }
        );
        const foundUser = results.find((u) => u !== null);
        if (foundUser) return foundUser;
      } catch (error) {
        logger.debug(`Cross-shard user cache search failed for ${userId}`);
      }
    }
    try {
      const fetched = await client.users.fetch(userId);
      return this.serializeUser(fetched);
    } catch (error) {
      logger.debug(`Failed to fetch user ${userId} from API`);
      return null;
    }
  }
  /**
   * Execute a function on the specific shard that owns a guild
   */
  async executeOnGuildShard(client, guildId, fn, context) {
    if (client.guilds.cache.has(guildId)) {
      return await fn(client, context);
    }
    if (!this.isSharded(client)) {
      return null;
    }
    try {
      const results = await client.shard.broadcastEval(
        async (c, { gId, innerContext }) => {
          if (!c.guilds.cache.has(gId)) return null;
          return null;
        },
        { context: { gId: guildId, innerContext: context } }
      );
      return results.find((r) => r !== null) || null;
    } catch (error) {
      logger.error(`Error executing action on guild shard for guild ${guildId}:`, error);
      return null;
    }
  }
  /**
   * Helper to serialize Guild object into JSON-friendly structure
   */
  serializeGuild(guild, shardId) {
    return {
      id: guild.id,
      name: guild.name,
      icon: guild.icon,
      memberCount: guild.memberCount,
      ownerId: guild.ownerId,
      shardId,
      joinedAt: guild.joinedAt?.toISOString() || null,
      banner: guild.banner,
      description: guild.description,
      features: Array.from(guild.features),
      large: guild.large,
      vanityURLCode: guild.vanityURLCode
    };
  }
  /**
   * Helper to serialize User object into JSON-friendly structure
   */
  serializeUser(user) {
    return {
      id: user.id,
      username: user.username,
      discriminator: user.discriminator,
      avatar: user.avatar,
      tag: user.tag,
      bot: user.bot
    };
  }
}
export const crossShardService = new CrossShardService();
