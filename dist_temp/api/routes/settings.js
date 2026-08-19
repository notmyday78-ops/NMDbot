"use strict";
import { Router } from "express";
import { getDatabase } from "../../database/connection";
import {
  guildSettings,
  guilds as guildsTable,
  economyShopItems,
  xpRewards,
  ticketPanels,
  warningAutomations
} from "../../database/schema";
import { eq } from "drizzle-orm";
import { logger } from "../../utils/logger";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
const router = Router();
const guildSettingsSchema = z.object({
  prefix: z.string().min(1).max(5).optional(),
  language: z.enum(["en", "de", "es", "fr"]).optional(),
  timezone: z.string().optional(),
  notifications: z.object({
    welcomeEnabled: z.boolean().optional(),
    welcomeChannel: z.string().nullable().optional(),
    welcomeMessage: z.string().max(2e3).optional(),
    welcomeEmbed: z.boolean().optional(),
    goodbyeEnabled: z.boolean().optional(),
    goodbyeChannel: z.string().nullable().optional(),
    goodbyeMessage: z.string().max(2e3).optional(),
    goodbyeEmbed: z.boolean().optional()
  }).optional(),
  automod: z.object({
    enabled: z.boolean().optional(),
    antiSpam: z.boolean().optional(),
    antiLinks: z.boolean().optional(),
    antiInvites: z.boolean().optional(),
    antiMassMention: z.boolean().optional(),
    maxMentions: z.number().min(3).max(20).optional(),
    antiCaps: z.boolean().optional(),
    capsPercentage: z.number().min(50).max(100).optional(),
    blacklistedWords: z.array(z.string()).optional(),
    immuneRoles: z.array(z.string()).optional(),
    immuneChannels: z.array(z.string()).optional()
  }).optional(),
  logging: z.object({
    enabled: z.boolean().optional(),
    logChannel: z.string().nullable().optional(),
    messageDelete: z.boolean().optional(),
    messageEdit: z.boolean().optional(),
    memberJoin: z.boolean().optional(),
    memberLeave: z.boolean().optional(),
    memberBan: z.boolean().optional(),
    memberUnban: z.boolean().optional(),
    roleCreate: z.boolean().optional(),
    roleDelete: z.boolean().optional(),
    channelCreate: z.boolean().optional(),
    channelDelete: z.boolean().optional(),
    voiceJoin: z.boolean().optional(),
    voiceLeave: z.boolean().optional()
  }).optional(),
  features: z.object({
    economy: z.boolean().optional(),
    xp: z.boolean().optional(),
    moderation: z.boolean().optional(),
    tickets: z.boolean().optional(),
    giveaways: z.boolean().optional(),
    music: z.boolean().optional(),
    fun: z.boolean().optional(),
    utility: z.boolean().optional()
  }).optional()
});
router.patch("/:guildId/settings", async (req, res) => {
  const { guildId } = req.params;
  try {
    const validation = guildSettingsSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "Validation Error",
        message: "Invalid request body",
        details: validation.error.errors
      });
    }
    const db = getDatabase();
    const updates = validation.data;
    if (updates.prefix || updates.language) {
      const guildUpdates = {};
      if (updates.prefix) guildUpdates.prefix = updates.prefix;
      if (updates.language) guildUpdates.language = updates.language;
      await db.update(guildsTable).set(guildUpdates).where(eq(guildsTable.id, guildId));
    }
    const [existingSettings] = await db.select().from(guildSettings).where(eq(guildSettings.guildId, guildId)).limit(1);
    const settingsUpdates = {
      updatedAt: /* @__PURE__ */ new Date()
    };
    if (updates.notifications) {
      const notif = updates.notifications;
      if (notif.welcomeEnabled !== void 0) settingsUpdates.welcomeEnabled = notif.welcomeEnabled;
      if (notif.welcomeChannel !== void 0) settingsUpdates.welcomeChannel = notif.welcomeChannel;
      if (notif.welcomeMessage !== void 0) settingsUpdates.welcomeMessage = notif.welcomeMessage;
      if (notif.welcomeEmbed !== void 0)
        settingsUpdates.welcomeEmbedEnabled = notif.welcomeEmbed;
      if (notif.goodbyeEnabled !== void 0) settingsUpdates.goodbyeEnabled = notif.goodbyeEnabled;
      if (notif.goodbyeChannel !== void 0) settingsUpdates.goodbyeChannel = notif.goodbyeChannel;
      if (notif.goodbyeMessage !== void 0) settingsUpdates.goodbyeMessage = notif.goodbyeMessage;
      if (notif.goodbyeEmbed !== void 0)
        settingsUpdates.goodbyeEmbedEnabled = notif.goodbyeEmbed;
    }
    if (updates.automod) {
      const automod = updates.automod;
      if (automod.antiSpam !== void 0) settingsUpdates.antiSpamEnabled = automod.antiSpam;
      if (automod.maxMentions !== void 0) settingsUpdates.maxMentions = automod.maxMentions;
    }
    if (updates.logging) {
      const logging = updates.logging;
      if (logging.enabled !== void 0) settingsUpdates.logsEnabled = logging.enabled;
      if (logging.logChannel !== void 0) settingsUpdates.logsChannel = logging.logChannel;
    }
    if (updates.features) {
      const features = updates.features;
      if (features.xp !== void 0) settingsUpdates.xpEnabled = features.xp;
    }
    if (!existingSettings) {
      await db.insert(guildSettings).values({
        ...settingsUpdates,
        guildId,
        createdAt: /* @__PURE__ */ new Date()
      });
    } else {
      await db.update(guildSettings).set(settingsUpdates).where(eq(guildSettings.guildId, guildId));
    }
    logger.info(`Updated settings for guild ${guildId}`);
    return res.json({
      success: true,
      message: "Guild settings updated successfully"
    });
  } catch (error) {
    logger.error("Error updating guild settings:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to update guild settings"
    });
  }
});
router.get("/:guildId/settings/export", async (req, res) => {
  const { guildId } = req.params;
  try {
    const db = getDatabase();
    const [guild] = await db.select().from(guildsTable).where(eq(guildsTable.id, guildId)).limit(1);
    const [settings] = await db.select().from(guildSettings).where(eq(guildSettings.guildId, guildId)).limit(1);
    const shopItems = await db.select().from(economyShopItems).where(eq(economyShopItems.guildId, guildId));
    const xpRoleRewards = await db.select().from(xpRewards).where(eq(xpRewards.guildId, guildId));
    const ticketsPanels = await db.select().from(ticketPanels).where(eq(ticketPanels.guildId, guildId));
    const warningAutos = await db.select().from(warningAutomations).where(eq(warningAutomations.guildId, guildId));
    const exportData = {
      version: "1.0.0",
      exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
      guildId,
      guild: {
        prefix: guild?.prefix || "!",
        language: guild?.language || "en"
      },
      settings: settings || {},
      economy: {
        shopItems: shopItems.map((item) => ({
          name: item.name,
          description: item.description,
          price: item.price,
          type: item.type,
          effectType: item.effectType,
          effectValue: item.effectValue,
          stock: item.stock,
          requiresRole: item.requiresRole,
          enabled: item.enabled
        }))
      },
      xp: {
        roleRewards: xpRoleRewards.map((reward) => ({
          level: reward.level,
          roleId: reward.roleId
        }))
      },
      tickets: {
        panels: ticketsPanels.map((panel) => ({
          title: panel.title,
          description: panel.description,
          categoryId: panel.categoryId,
          channelId: panel.channelId,
          welcomeMessage: panel.welcomeMessage,
          buttonLabel: panel.buttonLabel,
          // buttonEmoji: panel.buttonEmoji, // Field not in current schema
          buttonStyle: panel.buttonStyle,
          supportRoles: panel.supportRoles,
          maxTicketsPerUser: panel.maxTicketsPerUser
        }))
      },
      moderation: {
        warningAutomations: warningAutos.map((auto) => ({
          triggerType: auto.triggerType,
          triggerValue: auto.triggerValue,
          actions: auto.actions,
          enabled: auto.enabled
        }))
      }
    };
    return res.json(exportData);
  } catch (error) {
    logger.error("Error exporting guild settings:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to export guild settings"
    });
  }
});
router.post("/:guildId/settings/import", async (req, res) => {
  const { guildId } = req.params;
  const { data, options = {} } = req.body;
  try {
    if (!data || !data.version) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Invalid import data format"
      });
    }
    const db = getDatabase();
    const {
      importSettings = true,
      importEconomy = true,
      importXp = true,
      importTickets = true,
      importModeration = true,
      overwrite = false
    } = options;
    await db.transaction(async (tx) => {
      if (importSettings && data.guild) {
        await tx.update(guildsTable).set({
          prefix: data.guild.prefix,
          language: data.guild.language
        }).where(eq(guildsTable.id, guildId));
        if (data.settings) {
          const [existing] = await tx.select().from(guildSettings).where(eq(guildSettings.guildId, guildId)).limit(1);
          if (existing) {
            await tx.update(guildSettings).set({
              ...data.settings,
              guildId,
              // Ensure guildId stays correct
              updatedAt: /* @__PURE__ */ new Date()
            }).where(eq(guildSettings.guildId, guildId));
          } else {
            await tx.insert(guildSettings).values({
              ...data.settings,
              guildId,
              createdAt: /* @__PURE__ */ new Date(),
              updatedAt: /* @__PURE__ */ new Date()
            });
          }
        }
      }
      if (importEconomy && data.economy?.shopItems) {
        if (overwrite) {
          await tx.delete(economyShopItems).where(eq(economyShopItems.guildId, guildId));
        }
        for (const item of data.economy.shopItems) {
          await tx.insert(economyShopItems).values({
            id: uuidv4(),
            guildId,
            ...item,
            createdAt: /* @__PURE__ */ new Date(),
            updatedAt: /* @__PURE__ */ new Date()
          });
        }
      }
      if (importXp && data.xp?.roleRewards) {
        if (overwrite) {
          await tx.delete(xpRewards).where(eq(xpRewards.guildId, guildId));
        }
        for (const reward of data.xp.roleRewards) {
          await tx.insert(xpRewards).values({
            id: uuidv4(),
            guildId,
            ...reward,
            createdAt: /* @__PURE__ */ new Date()
          });
        }
      }
      if (importTickets && data.tickets?.panels) {
        if (overwrite) {
          await tx.delete(ticketPanels).where(eq(ticketPanels.guildId, guildId));
        }
        for (const panel of data.tickets.panels) {
          await tx.insert(ticketPanels).values({
            id: uuidv4(),
            guildId,
            ...panel,
            enabled: true,
            createdAt: /* @__PURE__ */ new Date()
          });
        }
      }
      if (importModeration && data.moderation?.warningAutomations) {
        if (overwrite) {
          await tx.delete(warningAutomations).where(eq(warningAutomations.guildId, guildId));
        }
        for (const auto of data.moderation.warningAutomations) {
          await tx.insert(warningAutomations).values({
            id: uuidv4(),
            guildId,
            ...auto,
            createdAt: /* @__PURE__ */ new Date()
          });
        }
      }
    });
    logger.info(`Imported settings for guild ${guildId}`);
    return res.json({
      success: true,
      message: "Settings imported successfully",
      imported: {
        settings: importSettings,
        economy: importEconomy,
        xp: importXp,
        tickets: importTickets,
        moderation: importModeration
      }
    });
  } catch (error) {
    logger.error("Error importing guild settings:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to import guild settings"
    });
  }
});
router.post("/:guildId/settings/reset", async (req, res) => {
  const { guildId } = req.params;
  const {
    resetSettings = true,
    resetEconomy = false,
    resetXp = false,
    resetTickets = false,
    resetModeration = false
  } = req.body;
  try {
    const db = getDatabase();
    await db.transaction(async (tx) => {
      if (resetSettings) {
        await tx.update(guildsTable).set({
          prefix: "!",
          language: "en"
        }).where(eq(guildsTable.id, guildId));
        await tx.delete(guildSettings).where(eq(guildSettings.guildId, guildId));
        logger.info(`Reset general settings for guild ${guildId}`);
      }
      if (resetEconomy) {
        await tx.delete(economyShopItems).where(eq(economyShopItems.guildId, guildId));
        logger.info(`Reset economy settings for guild ${guildId}`);
      }
      if (resetXp) {
        await tx.delete(xpRewards).where(eq(xpRewards.guildId, guildId));
        logger.info(`Reset XP settings for guild ${guildId}`);
      }
      if (resetTickets) {
        await tx.delete(ticketPanels).where(eq(ticketPanels.guildId, guildId));
        logger.info(`Reset ticket settings for guild ${guildId}`);
      }
      if (resetModeration) {
        await tx.delete(warningAutomations).where(eq(warningAutomations.guildId, guildId));
        logger.info(`Reset moderation settings for guild ${guildId}`);
      }
    });
    return res.json({
      success: true,
      message: "Settings reset successfully",
      reset: {
        settings: resetSettings,
        economy: resetEconomy,
        xp: resetXp,
        tickets: resetTickets,
        moderation: resetModeration
      }
    });
  } catch (error) {
    logger.error("Error resetting guild settings:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to reset guild settings"
    });
  }
});
export const settingsRouter = router;
