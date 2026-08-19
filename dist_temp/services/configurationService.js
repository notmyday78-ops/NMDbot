"use strict";
import { getDatabase } from "../database/connection";
import {
  guilds,
  guildSettings,
  xpSettings,
  xpRewards,
  economySettings,
  economyShopItems
} from "../database/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "../utils/logger";
export class ConfigurationService {
  // XP Configuration Methods
  async getXPConfig(guildId) {
    try {
      let [settings] = await getDatabase().select().from(guildSettings).where(eq(guildSettings.guildId, guildId)).limit(1);
      const [xpConfig] = await getDatabase().select().from(xpSettings).where(eq(xpSettings.guildId, guildId)).limit(1);
      if (!settings) {
        const [newSettings] = await getDatabase().insert(guildSettings).values({ guildId }).returning();
        settings = newSettings;
      }
      return {
        enabled: settings.xpEnabled,
        perMessage: settings.xpPerMessage,
        perVoiceMinute: settings.xpPerVoiceMinute,
        cooldown: settings.xpCooldown,
        announceLevelUp: settings.xpAnnounceLevelUp,
        levelUpChannel: settings.levelUpChannel || void 0,
        levelUpMessage: settings.levelUpMessage || void 0,
        boosterRole: settings.xpBoosterRole || void 0,
        boosterMultiplier: settings.xpBoosterMultiplier,
        ignoredChannels: xpConfig && xpConfig.ignoredChannels ? JSON.parse(xpConfig.ignoredChannels) : [],
        ignoredRoles: xpConfig && xpConfig.ignoredRoles ? JSON.parse(xpConfig.ignoredRoles) : [],
        noXpChannels: xpConfig && xpConfig.noXpChannels ? JSON.parse(xpConfig.noXpChannels) : [],
        doubleXpChannels: xpConfig && xpConfig.doubleXpChannels ? JSON.parse(xpConfig.doubleXpChannels) : [],
        roleMultipliers: xpConfig && xpConfig.roleMultipliers ? JSON.parse(xpConfig.roleMultipliers) : {},
        levelUpRewardsEnabled: xpConfig?.levelUpRewardsEnabled ?? true,
        stackRoleRewards: xpConfig?.stackRoleRewards ?? false
      };
    } catch (error) {
      logger.error(`Failed to get XP config for guild ${guildId}:`, error);
      throw error;
    }
  }
  async updateXPConfig(guildId, config) {
    try {
      const updateData = {};
      if (config.enabled !== void 0) updateData.xpEnabled = config.enabled;
      if (config.perMessage !== void 0) updateData.xpPerMessage = config.perMessage;
      if (config.perVoiceMinute !== void 0) updateData.xpPerVoiceMinute = config.perVoiceMinute;
      if (config.cooldown !== void 0) updateData.xpCooldown = config.cooldown;
      if (config.announceLevelUp !== void 0)
        updateData.xpAnnounceLevelUp = config.announceLevelUp;
      if (config.levelUpChannel !== void 0)
        updateData.levelUpChannel = config.levelUpChannel ?? null;
      if (config.levelUpMessage !== void 0)
        updateData.levelUpMessage = config.levelUpMessage ?? null;
      if (config.boosterRole !== void 0) updateData.xpBoosterRole = config.boosterRole;
      if (config.boosterMultiplier !== void 0)
        updateData.xpBoosterMultiplier = config.boosterMultiplier;
      if (Object.keys(updateData).length > 0) {
        await getDatabase().update(guildSettings).set({ ...updateData, updatedAt: /* @__PURE__ */ new Date() }).where(eq(guildSettings.guildId, guildId));
      }
      const xpUpdateData = {};
      if (config.ignoredChannels !== void 0)
        xpUpdateData.ignoredChannels = JSON.stringify(config.ignoredChannels);
      if (config.ignoredRoles !== void 0)
        xpUpdateData.ignoredRoles = JSON.stringify(config.ignoredRoles);
      if (config.noXpChannels !== void 0)
        xpUpdateData.noXpChannels = JSON.stringify(config.noXpChannels);
      if (config.doubleXpChannels !== void 0)
        xpUpdateData.doubleXpChannels = JSON.stringify(config.doubleXpChannels);
      if (config.roleMultipliers !== void 0)
        xpUpdateData.roleMultipliers = JSON.stringify(config.roleMultipliers);
      if (config.levelUpRewardsEnabled !== void 0)
        xpUpdateData.levelUpRewardsEnabled = config.levelUpRewardsEnabled;
      if (config.stackRoleRewards !== void 0)
        xpUpdateData.stackRoleRewards = config.stackRoleRewards;
      if (Object.keys(xpUpdateData).length > 0) {
        await getDatabase().insert(xpSettings).values({ guildId, ...xpUpdateData }).onConflictDoUpdate({
          target: xpSettings.guildId,
          set: { ...xpUpdateData, updatedAt: /* @__PURE__ */ new Date() }
        });
      }
    } catch (error) {
      logger.error(`Failed to update XP config for guild ${guildId}:`, error);
      throw error;
    }
  }
  async setXPRoleReward(guildId, level, roleId) {
    try {
      await getDatabase().insert(xpRewards).values({ guildId, level, roleId }).onConflictDoNothing();
    } catch (error) {
      logger.error(`Failed to set XP role reward for guild ${guildId}:`, error);
      throw error;
    }
  }
  async removeXPRoleReward(guildId, level) {
    try {
      await getDatabase().delete(xpRewards).where(and(eq(xpRewards.guildId, guildId), eq(xpRewards.level, level)));
    } catch (error) {
      logger.error(`Failed to remove XP role reward for guild ${guildId}:`, error);
      throw error;
    }
  }
  async getXPRoleRewards(guildId) {
    try {
      const rewards = await getDatabase().select().from(xpRewards).where(eq(xpRewards.guildId, guildId)).orderBy(xpRewards.level);
      return rewards;
    } catch (error) {
      logger.error(`Failed to get XP role rewards for guild ${guildId}:`, error);
      throw error;
    }
  }
  // Economy Configuration Methods
  async getEconomyConfig(guildId) {
    try {
      const [settings] = await getDatabase().select().from(economySettings).where(eq(economySettings.guildId, guildId)).limit(1);
      if (!settings) {
        const [newSettings] = await getDatabase().insert(economySettings).values({ guildId }).returning();
        return newSettings;
      }
      return settings;
    } catch (error) {
      logger.error(`Failed to get economy config for guild ${guildId}:`, error);
      throw error;
    }
  }
  async updateEconomyConfig(guildId, config) {
    try {
      await getDatabase().insert(economySettings).values({ guildId, ...config }).onConflictDoUpdate({
        target: economySettings.guildId,
        set: { ...config, updatedAt: /* @__PURE__ */ new Date() }
      });
    } catch (error) {
      logger.error(`Failed to update economy config for guild ${guildId}:`, error);
      throw error;
    }
  }
  async getShopItems(guildId) {
    try {
      const items = await getDatabase().select().from(economyShopItems).where(eq(economyShopItems.guildId, guildId)).orderBy(economyShopItems.price);
      return items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        price: Number(item.price),
        type: item.type,
        effectType: item.effectType || void 0,
        effectValue: item.effectValue,
        stock: item.stock,
        requiresRole: item.requiresRole || void 0,
        enabled: item.enabled
      }));
    } catch (error) {
      logger.error(`Failed to get shop items for guild ${guildId}:`, error);
      throw error;
    }
  }
  async addShopItem(guildId, item) {
    try {
      const [newItem] = await getDatabase().insert(economyShopItems).values({
        guildId,
        name: item.name,
        description: item.description,
        price: item.price,
        type: item.type,
        effectType: item.effectType,
        effectValue: item.effectValue,
        stock: item.stock,
        requiresRole: item.requiresRole,
        enabled: item.enabled
      }).returning();
      return newItem.id;
    } catch (error) {
      logger.error(`Failed to add shop item for guild ${guildId}:`, error);
      throw error;
    }
  }
  async updateShopItem(itemId, updates) {
    try {
      await getDatabase().update(economyShopItems).set({ ...updates, updatedAt: /* @__PURE__ */ new Date() }).where(eq(economyShopItems.id, itemId));
    } catch (error) {
      logger.error(`Failed to update shop item ${itemId}:`, error);
      throw error;
    }
  }
  async deleteShopItem(itemId) {
    try {
      await getDatabase().delete(economyShopItems).where(eq(economyShopItems.id, itemId));
    } catch (error) {
      logger.error(`Failed to delete shop item ${itemId}:`, error);
      throw error;
    }
  }
  // Welcome Configuration Methods
  async getWelcomeConfig(guildId) {
    try {
      let [settings] = await getDatabase().select().from(guildSettings).where(eq(guildSettings.guildId, guildId)).limit(1);
      if (!settings) {
        const [newSettings] = await getDatabase().insert(guildSettings).values({ guildId }).returning();
        settings = newSettings;
      }
      return {
        enabled: settings.welcomeEnabled,
        channel: settings.welcomeChannel || void 0,
        message: settings.welcomeMessage || void 0,
        embedEnabled: settings.welcomeEmbedEnabled,
        imageEnabled: settings.welcomeImageEnabled,
        embedColor: settings.welcomeEmbedColor || "#0099FF",
        embedTitle: settings.welcomeEmbedTitle || void 0,
        embedImage: settings.welcomeEmbedImage || void 0,
        embedThumbnail: settings.welcomeEmbedThumbnail || void 0,
        dmEnabled: settings.welcomeDmEnabled,
        dmMessage: settings.welcomeDmMessage || void 0
      };
    } catch (error) {
      logger.error(`Failed to get welcome config for guild ${guildId}:`, error);
      throw error;
    }
  }
  async updateWelcomeConfig(guildId, config) {
    try {
      const updateData = {};
      if (config.enabled !== void 0) updateData.welcomeEnabled = config.enabled;
      if (config.channel !== void 0) updateData.welcomeChannel = config.channel;
      if (config.message !== void 0) updateData.welcomeMessage = config.message;
      if (config.embedEnabled !== void 0) updateData.welcomeEmbedEnabled = config.embedEnabled;
      if (config.imageEnabled !== void 0) updateData.welcomeImageEnabled = config.imageEnabled;
      if (config.embedColor !== void 0) updateData.welcomeEmbedColor = config.embedColor;
      if (config.embedTitle !== void 0) updateData.welcomeEmbedTitle = config.embedTitle;
      if (config.embedImage !== void 0) updateData.welcomeEmbedImage = config.embedImage;
      if (config.embedThumbnail !== void 0)
        updateData.welcomeEmbedThumbnail = config.embedThumbnail;
      if (config.dmEnabled !== void 0) updateData.welcomeDmEnabled = config.dmEnabled;
      if (config.dmMessage !== void 0) updateData.welcomeDmMessage = config.dmMessage;
      await getDatabase().update(guildSettings).set({ ...updateData, updatedAt: /* @__PURE__ */ new Date() }).where(eq(guildSettings.guildId, guildId));
    } catch (error) {
      logger.error(`Failed to update welcome config for guild ${guildId}:`, error);
      throw error;
    }
  }
  // Goodbye Configuration Methods
  async getGoodbyeConfig(guildId) {
    try {
      let [settings] = await getDatabase().select().from(guildSettings).where(eq(guildSettings.guildId, guildId)).limit(1);
      if (!settings) {
        const [newSettings] = await getDatabase().insert(guildSettings).values({ guildId }).returning();
        settings = newSettings;
      }
      return {
        enabled: settings.goodbyeEnabled,
        channel: settings.goodbyeChannel || void 0,
        message: settings.goodbyeMessage || void 0,
        embedEnabled: settings.goodbyeEmbedEnabled,
        imageEnabled: settings.goodbyeImageEnabled,
        embedColor: settings.goodbyeEmbedColor || "#FF0000",
        embedTitle: settings.goodbyeEmbedTitle || void 0,
        embedImage: settings.goodbyeEmbedImage || void 0,
        embedThumbnail: settings.goodbyeEmbedThumbnail || void 0
      };
    } catch (error) {
      logger.error(`Failed to get goodbye config for guild ${guildId}:`, error);
      throw error;
    }
  }
  async updateGoodbyeConfig(guildId, config) {
    try {
      const updateData = {};
      if (config.enabled !== void 0) updateData.goodbyeEnabled = config.enabled;
      if (config.channel !== void 0) updateData.goodbyeChannel = config.channel;
      if (config.message !== void 0) updateData.goodbyeMessage = config.message;
      if (config.embedEnabled !== void 0) updateData.goodbyeEmbedEnabled = config.embedEnabled;
      if (config.imageEnabled !== void 0) updateData.goodbyeImageEnabled = config.imageEnabled;
      if (config.embedColor !== void 0) updateData.goodbyeEmbedColor = config.embedColor;
      if (config.embedTitle !== void 0) updateData.goodbyeEmbedTitle = config.embedTitle;
      if (config.embedImage !== void 0) updateData.goodbyeEmbedImage = config.embedImage;
      if (config.embedThumbnail !== void 0)
        updateData.goodbyeEmbedThumbnail = config.embedThumbnail;
      await getDatabase().update(guildSettings).set({ ...updateData, updatedAt: /* @__PURE__ */ new Date() }).where(eq(guildSettings.guildId, guildId));
    } catch (error) {
      logger.error(`Failed to update goodbye config for guild ${guildId}:`, error);
      throw error;
    }
  }
  // Autorole Configuration Methods
  async getAutoroleConfig(guildId) {
    try {
      let [settings] = await getDatabase().select().from(guildSettings).where(eq(guildSettings.guildId, guildId)).limit(1);
      if (!settings) {
        const [newSettings] = await getDatabase().insert(guildSettings).values({ guildId }).returning();
        settings = newSettings;
      }
      return {
        enabled: settings.autoroleEnabled,
        roles: settings.autoroleRoles ? JSON.parse(settings.autoroleRoles) : []
      };
    } catch (error) {
      logger.error(`Failed to get autorole config for guild ${guildId}:`, error);
      throw error;
    }
  }
  async updateAutoroleConfig(guildId, config) {
    try {
      const updateData = {};
      if (config.enabled !== void 0) updateData.autoroleEnabled = config.enabled;
      if (config.roles !== void 0) updateData.autoroleRoles = JSON.stringify(config.roles);
      await getDatabase().update(guildSettings).set({ ...updateData, updatedAt: /* @__PURE__ */ new Date() }).where(eq(guildSettings.guildId, guildId));
    } catch (error) {
      logger.error(`Failed to update autorole config for guild ${guildId}:`, error);
      throw error;
    }
  }
  // Language Configuration Methods
  async getGuildLanguage(guildId) {
    try {
      const [guild] = await getDatabase().select().from(guilds).where(eq(guilds.id, guildId)).limit(1);
      return guild?.language || "en";
    } catch (error) {
      logger.error(`Failed to get guild language for ${guildId}:`, error);
      throw error;
    }
  }
  async setGuildLanguage(guildId, language) {
    try {
      await getDatabase().update(guilds).set({ language, updatedAt: /* @__PURE__ */ new Date() }).where(eq(guilds.id, guildId));
    } catch (error) {
      logger.error(`Failed to set guild language for ${guildId}:`, error);
      throw error;
    }
  }
}
export const configurationService = new ConfigurationService();
