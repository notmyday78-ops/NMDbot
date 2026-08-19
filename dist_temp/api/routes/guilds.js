"use strict";
import { Router } from "express";
import { client } from "../../index";
import { crossShardService } from "../../services/crossShardService";
import { getDatabase } from "../../database/connection";
import {
  guilds as guildsTable,
  guildSettings,
  economyBalances,
  economyShopItems,
  economySettings,
  modCases,
  modLogSettings,
  tickets,
  ticketPanels,
  giveaways,
  giveawayEntries,
  xpRewards,
  auditLogs,
  userXp
} from "../../database/schema";
import { eq, desc, and, sql, gte } from "drizzle-orm";
import { logger } from "../../utils/logger";
import { triviaRouter } from "./trivia";
const router = Router();
router.use("/", triviaRouter);
router.get("/:guildId/economy", async (req, res) => {
  const { guildId } = req.params;
  const db = getDatabase();
  try {
    const shopItems = await db.select().from(economyShopItems).where(eq(economyShopItems.guildId, guildId));
    const topBalances = await db.select({
      userId: economyBalances.userId,
      balance: economyBalances.balance,
      bankBalance: economyBalances.bankBalance,
      totalEarned: sql`COALESCE(${economyBalances.balance}, 0) + COALESCE(${economyBalances.bankBalance}, 0)`,
      totalSpent: sql`0`
    }).from(economyBalances).where(eq(economyBalances.guildId, guildId)).orderBy(desc(sql`${economyBalances.balance} + ${economyBalances.bankBalance}`)).limit(10);
    const [ecoSettings] = await db.select().from(economySettings).where(eq(economySettings.guildId, guildId)).limit(1);
    const response = {
      settings: {
        enabled: true,
        currency_name: ecoSettings?.currencyName || "coins",
        currency_symbol: ecoSettings?.currencySymbol || "\u{1FA99}",
        starting_balance: ecoSettings?.startingBalance ?? 100,
        daily_amount: ecoSettings?.dailyAmount ?? 50,
        daily_streak_bonus: ecoSettings?.dailyStreakBonus ?? 10
      },
      shopItems: shopItems.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description || "",
        price: item.price,
        type: item.type || "item",
        enabled: true,
        stock: item.stock || -1
      })),
      topBalances: topBalances.map((user) => ({
        userId: user.userId,
        balance: user.balance || 0,
        bankBalance: user.bankBalance || 0,
        totalEarned: Number(user.totalEarned) || 0,
        totalSpent: Number(user.totalSpent) || 0
      }))
    };
    res.json(response);
  } catch (error) {
    logger.error("Error fetching guild economy:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch economy data"
    });
  }
});
router.get("/:guildId/moderation", async (req, res) => {
  const { guildId } = req.params;
  const db = getDatabase();
  try {
    const warnings = await db.select().from(modCases).where(and(eq(modCases.guildId, guildId), eq(modCases.type, "warn"))).orderBy(desc(modCases.createdAt)).limit(50);
    const recentCases = await db.select().from(modCases).where(eq(modCases.guildId, guildId)).orderBy(desc(modCases.createdAt)).limit(20);
    const stats = await db.select({
      type: modCases.type,
      count: sql`COUNT(*)`
    }).from(modCases).where(eq(modCases.guildId, guildId)).groupBy(modCases.type);
    const moderationStats = {
      totalWarnings: 0,
      totalBans: 0,
      totalMutes: 0,
      totalKicks: 0
    };
    stats.forEach((stat) => {
      const count = Number(stat.count) || 0;
      switch (stat.type) {
        case "warn":
          moderationStats.totalWarnings = count;
          break;
        case "ban":
          moderationStats.totalBans = count;
          break;
        case "mute":
          moderationStats.totalMutes = count;
          break;
        case "kick":
          moderationStats.totalKicks = count;
          break;
      }
    });
    const [gSettings] = await db.select().from(guildSettings).where(eq(guildSettings.guildId, guildId)).limit(1);
    const [modLog] = await db.select().from(modLogSettings).where(and(eq(modLogSettings.guildId, guildId), eq(modLogSettings.category, "moderation"))).limit(1);
    const response = {
      warnings: warnings.map((w) => ({
        id: w.id,
        userId: w.userId,
        moderatorId: w.moderatorId,
        reason: w.reason || "No reason provided",
        timestamp: w.createdAt.toISOString()
      })),
      recentCases: recentCases.map((c) => ({
        id: c.id,
        type: c.type,
        userId: c.userId,
        moderatorId: c.moderatorId,
        reason: c.reason || "No reason provided",
        timestamp: c.createdAt.toISOString()
      })),
      stats: moderationStats,
      settings: {
        enabled: gSettings?.securityEnabled ?? true,
        auto_mod_enabled: gSettings?.antiSpamEnabled ?? false,
        log_channel: modLog?.channelId || gSettings?.logsChannel || null,
        mute_role: gSettings?.securityAlertRole || null
      }
    };
    res.json(response);
  } catch (error) {
    logger.error("Error fetching guild moderation:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch moderation data"
    });
  }
});
router.get("/:guildId/tickets", async (req, res) => {
  const { guildId } = req.params;
  const db = getDatabase();
  try {
    const allTickets = await db.select().from(tickets).where(eq(tickets.guildId, guildId)).orderBy(desc(tickets.createdAt));
    const panels = await db.select().from(ticketPanels).where(eq(ticketPanels.guildId, guildId));
    const openTickets = allTickets.filter((t) => t.status === "open");
    const closedTickets = allTickets.filter((t) => t.status === "closed");
    let avgResponseTime = 3e5;
    if (closedTickets.length > 0) {
      const totalDuration = closedTickets.reduce((acc, t) => {
        const closed = t.closedAt ? t.closedAt.getTime() : t.createdAt.getTime() + 3e5;
        return acc + (closed - t.createdAt.getTime());
      }, 0);
      avgResponseTime = Math.round(totalDuration / closedTickets.length);
    }
    const response = {
      tickets: openTickets.slice(0, 10).map((t) => ({
        id: t.id,
        userId: t.userId,
        channelId: t.channelId,
        status: t.status,
        category: "support",
        createdAt: t.createdAt.toISOString()
      })),
      panels: panels.map((p) => ({
        id: p.id,
        name: p.title || "Ticket Panel",
        category: p.categoryId,
        message: p.welcomeMessage || ""
      })),
      stats: {
        total_tickets: allTickets.length,
        open_tickets: openTickets.length,
        closed_tickets: closedTickets.length,
        average_response_time: avgResponseTime
      },
      settings: {
        enabled: true,
        ticket_category: panels[0]?.categoryId || null,
        support_roles: [],
        welcome_message: "Thank you for creating a ticket!"
      }
    };
    res.json(response);
  } catch (error) {
    logger.error("Error fetching guild tickets:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch ticket data"
    });
  }
});
router.get("/:guildId/xp", async (req, res) => {
  const { guildId } = req.params;
  const db = getDatabase();
  try {
    const leaderboard = await db.select({
      userId: userXp.userId,
      xp: userXp.xp,
      level: userXp.level,
      rank: sql`ROW_NUMBER() OVER (ORDER BY ${userXp.xp} DESC)`
    }).from(userXp).where(eq(userXp.guildId, guildId)).orderBy(desc(userXp.xp)).limit(10);
    const settings = await db.select().from(guildSettings).where(eq(guildSettings.guildId, guildId)).limit(1);
    const roleRewards = await db.select().from(xpRewards).where(eq(xpRewards.guildId, guildId)).orderBy(xpRewards.level);
    const guildConfig = settings[0];
    const response = {
      leaderboard: leaderboard.map((user) => ({
        userId: user.userId,
        xp: user.xp || 0,
        level: user.level || 0,
        rank: Number(user.rank) || 1,
        messages: 0
      })),
      topUsers: leaderboard.map((user) => ({
        userId: user.userId,
        xp: user.xp || 0,
        level: user.level || 0,
        rank: Number(user.rank) || 1,
        messages: 0
      })),
      settings: {
        enabled: guildConfig?.xpEnabled ?? true,
        xp_rate: guildConfig?.xpPerMessage || 15,
        xp_cooldown: guildConfig?.xpCooldown || 60,
        level_up_message: guildConfig?.levelUpMessage || "Congratulations {user}! You've reached level {level}!",
        level_up_channel: guildConfig?.levelUpChannel || null
      },
      roles: roleRewards.map((r) => ({
        level: r.level,
        roleId: r.roleId
      }))
    };
    res.json(response);
  } catch (error) {
    logger.error("Error fetching guild XP:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch XP data"
    });
  }
});
router.get("/:guildId/giveaways", async (req, res) => {
  const { guildId } = req.params;
  const db = getDatabase();
  try {
    const now = /* @__PURE__ */ new Date();
    const activeGiveaways = await db.select().from(giveaways).where(
      and(
        eq(giveaways.guildId, guildId),
        eq(giveaways.status, "active"),
        gte(giveaways.endTime, now)
      )
    ).orderBy(giveaways.endTime);
    const endedGiveaways = await db.select().from(giveaways).where(and(eq(giveaways.guildId, guildId), eq(giveaways.status, "ended"))).orderBy(desc(giveaways.endTime)).limit(10);
    const entryCounts = await db.select({
      giveawayId: giveawayEntries.giveawayId,
      count: sql`COUNT(*)`
    }).from(giveawayEntries).where(
      sql`${giveawayEntries.giveawayId} IN ${sql.raw(`(${activeGiveaways.map((g) => `'${g.giveawayId}'`).join(",")})`)}`
    ).groupBy(giveawayEntries.giveawayId);
    const entryMap = new Map(entryCounts.map((e) => [e.giveawayId, Number(e.count)]));
    const totalParticipants = await db.select({
      count: sql`COUNT(DISTINCT ${giveawayEntries.userId})`
    }).from(giveawayEntries).innerJoin(giveaways, eq(giveawayEntries.giveawayId, giveaways.giveawayId)).where(eq(giveaways.guildId, guildId));
    const response = {
      active_giveaways: activeGiveaways.map((g) => ({
        id: g.giveawayId,
        prize: g.prize,
        winnersCount: g.winnerCount,
        endTime: g.endTime.toISOString(),
        channelId: g.channelId,
        messageId: g.messageId,
        entries: entryMap.get(g.giveawayId) || 0,
        hostId: g.hostedBy
      })),
      ended_giveaways: endedGiveaways.map((g) => ({
        id: g.giveawayId,
        prize: g.prize,
        winnersCount: g.winnerCount,
        endTime: g.endTime.toISOString(),
        winners: g.winners || []
      })),
      stats: {
        total_giveaways: activeGiveaways.length + endedGiveaways.length,
        active_giveaways: activeGiveaways.length,
        total_participants: Number(totalParticipants[0]?.count) || 0
      }
    };
    res.json(response);
  } catch (error) {
    logger.error("Error fetching guild giveaways:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch giveaway data"
    });
  }
});
router.get("/:guildId/settings", async (req, res) => {
  const { guildId } = req.params;
  const db = getDatabase();
  try {
    const guild = await db.select().from(guildsTable).where(eq(guildsTable.id, guildId)).limit(1);
    const settings = await db.select().from(guildSettings).where(eq(guildSettings.guildId, guildId)).limit(1);
    const guildData = guild[0];
    const guildConfig = settings[0];
    const response = {
      prefix: guildData?.prefix || "!",
      language: guildData?.language || "en",
      timezone: "UTC",
      notifications: {
        welcome_enabled: guildConfig?.welcomeEnabled || false,
        welcome_channel: guildConfig?.welcomeChannel || null,
        welcome_message: guildConfig?.welcomeMessage || "Welcome {user} to {server}!",
        goodbye_enabled: guildConfig?.goodbyeEnabled || false,
        goodbye_channel: guildConfig?.goodbyeChannel || null,
        goodbye_message: guildConfig?.goodbyeMessage || "Goodbye {user}!"
      },
      automod: {
        enabled: guildConfig?.securityEnabled || false,
        spam_detection: guildConfig?.antiSpamEnabled || false,
        link_filter: false
      },
      logging: {
        enabled: guildConfig?.logsEnabled || false,
        log_channel: guildConfig?.logsChannel || null,
        message_delete: true,
        message_edit: true
      }
    };
    res.json(response);
  } catch (error) {
    logger.error("Error fetching guild settings:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch settings"
    });
  }
});
router.get("/:guildId/members", async (req, res) => {
  const { guildId } = req.params;
  try {
    let guild = client.guilds.cache.get(guildId);
    if (!guild) {
      guild = await crossShardService.fetchGuild(client, guildId);
    }
    if (!guild) {
      return res.status(404).json({
        error: "Not Found",
        message: "Guild not found"
      });
    }
    const members = guild.members?.cache;
    const onlineMembers = members ? members.filter((m) => m.presence?.status !== "offline") : [];
    const bots = members ? members.filter((m) => m.user?.bot) : [];
    const humans = members ? members.filter((m) => !m.user?.bot) : [];
    const response = {
      members: members ? Array.from(members.values()).slice(0, 20).map((m) => ({
        id: m.id,
        username: m.user?.username,
        discriminator: m.user?.discriminator,
        nickname: m.nickname,
        roles: m.roles?.cache ? Array.from(m.roles.cache.keys()) : [],
        joinedAt: m.joinedAt?.toISOString?.() || null,
        isBot: Boolean(m.user?.bot)
      })) : [],
      stats: {
        total: guild.memberCount || 0,
        online: typeof onlineMembers === "number" ? onlineMembers : onlineMembers?.size || 0,
        bots: typeof bots === "number" ? bots : bots?.size || 0,
        humans: typeof humans === "number" ? humans : humans?.size || 0
      }
    };
    res.json(response);
  } catch (error) {
    logger.error("Error fetching guild members:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch members"
    });
  }
});
router.get("/:guildId/logs", async (req, res) => {
  const { guildId } = req.params;
  const db = getDatabase();
  try {
    const limitParam = parseInt(req.query.limit) || 50;
    const offsetParam = parseInt(req.query.offset) || 0;
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.guildId, guildId)).orderBy(desc(auditLogs.createdAt)).limit(limitParam).offset(offsetParam);
    const [{ count }] = await db.select({ count: sql`COUNT(*)` }).from(auditLogs).where(eq(auditLogs.guildId, guildId));
    const response = {
      logs: logs.map((l) => ({
        id: l.id,
        action: l.action,
        userId: l.userId,
        guildId: l.guildId,
        targetId: l.targetId,
        targetType: l.targetType,
        details: l.details || {},
        createdAt: l.createdAt.toISOString()
      })),
      total: Number(count) || 0
    };
    res.json(response);
  } catch (error) {
    logger.error("Error fetching guild logs:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch logs"
    });
  }
});
router.get(
  "/:guildId/notifications",
  async (req, res) => {
    const { guildId } = req.params;
    const db = getDatabase();
    try {
      let guild = client.guilds.cache.get(guildId);
      if (!guild) {
        guild = await crossShardService.fetchGuild(client, guildId);
      }
      if (!guild) {
        return res.status(404).json({
          error: "Not Found",
          message: "Guild not found"
        });
      }
      const settings = await db.select().from(guildSettings).where(eq(guildSettings.guildId, guildId)).limit(1);
      const guildConfig = settings[0];
      const response = {
        channels: guild.channels?.cache ? Array.from(guild.channels.cache.values()).filter((c) => c.type === 0).map((c) => ({
          id: c.id,
          name: c.name
        })) : [],
        settings: {
          welcome: {
            enabled: guildConfig?.welcomeEnabled || false,
            channel: guildConfig?.welcomeChannel || null,
            message: guildConfig?.welcomeMessage || "Welcome {user}!"
          },
          goodbye: {
            enabled: guildConfig?.goodbyeEnabled || false,
            channel: guildConfig?.goodbyeChannel || null,
            message: guildConfig?.goodbyeMessage || "Goodbye {user}!"
          },
          levelup: {
            enabled: guildConfig?.xpAnnounceLevelUp || false,
            channel: guildConfig?.levelUpChannel || null,
            message: guildConfig?.levelUpMessage || "Congratulations {user}! You reached level {level}!"
          }
        }
      };
      res.json(response);
    } catch (error) {
      logger.error("Error fetching guild notifications:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to fetch notification settings"
      });
    }
  }
);
export const guildsRouter = router;
