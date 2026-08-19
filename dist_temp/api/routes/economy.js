"use strict";
import { Router } from "express";
import { getDatabase } from "../../database/connection";
import {
  economyShopItems,
  economyBalances,
  economyTransactions
} from "../../database/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "../../utils/logger";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { economyRepository } from "../../repositories/economyRepository";
const router = Router();
const createShopItemSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  price: z.number().min(0),
  type: z.string().optional(),
  effectType: z.string().optional(),
  effectValue: z.any().optional(),
  stock: z.number().optional(),
  requiresRole: z.string().optional(),
  enabled: z.boolean().optional()
});
const updateShopItemSchema = createShopItemSchema.partial();
const economySettingsSchema = z.object({
  currencyName: z.string().optional(),
  currencySymbol: z.string().optional(),
  startingBalance: z.number().min(0).optional(),
  dailyAmount: z.number().min(0).optional(),
  dailyStreakBonus: z.number().min(0).optional(),
  workCooldown: z.number().min(0).optional(),
  workRewardMin: z.number().min(0).optional(),
  workRewardMax: z.number().min(0).optional(),
  robEnabled: z.boolean().optional(),
  robCooldown: z.number().min(0).optional(),
  robSuccessRate: z.number().min(0).max(100).optional(),
  robMinAmount: z.number().min(0).optional(),
  maxBet: z.number().min(1).optional(),
  minBet: z.number().min(0).optional()
});
router.post("/:guildId/economy/shop-items", async (req, res) => {
  const { guildId } = req.params;
  try {
    const validation = createShopItemSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "Validation Error",
        message: "Invalid request body",
        details: validation.error.errors
      });
    }
    const db = getDatabase();
    const itemData = validation.data;
    const itemId = uuidv4();
    const [newItem] = await db.insert(economyShopItems).values({
      guildId,
      name: itemData.name,
      description: itemData.description || "",
      price: itemData.price,
      type: itemData.type || "item",
      effectType: itemData.effectType || null,
      effectValue: itemData.effectValue || null,
      stock: itemData.stock || null,
      requiresRole: itemData.requiresRole || null,
      enabled: itemData.enabled !== false,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    }).returning();
    logger.info(`Created shop item ${itemId} for guild ${guildId}`);
    return res.status(201).json({
      success: true,
      item: {
        id: newItem.id,
        name: newItem.name,
        description: newItem.description,
        price: newItem.price,
        type: newItem.type,
        effectType: newItem.effectType,
        effectValue: newItem.effectValue,
        stock: newItem.stock,
        enabled: newItem.enabled
      }
    });
  } catch (error) {
    logger.error("Error creating shop item:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to create shop item"
    });
  }
});
router.patch("/:guildId/economy/shop-items/:itemId", async (req, res) => {
  const { guildId, itemId } = req.params;
  try {
    const validation = updateShopItemSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "Validation Error",
        message: "Invalid request body",
        details: validation.error.errors
      });
    }
    const db = getDatabase();
    const updates = validation.data;
    const [existingItem] = await db.select().from(economyShopItems).where(and(eq(economyShopItems.id, itemId), eq(economyShopItems.guildId, guildId))).limit(1);
    if (!existingItem) {
      return res.status(404).json({
        error: "Not Found",
        message: "Shop item not found"
      });
    }
    const [updatedItem] = await db.update(economyShopItems).set({
      ...updates,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(and(eq(economyShopItems.id, itemId), eq(economyShopItems.guildId, guildId))).returning();
    logger.info(`Updated shop item ${itemId} for guild ${guildId}`);
    return res.json({
      success: true,
      item: {
        id: updatedItem.id,
        name: updatedItem.name,
        description: updatedItem.description,
        price: updatedItem.price,
        type: updatedItem.type,
        effectType: updatedItem.effectType,
        effectValue: updatedItem.effectValue,
        stock: updatedItem.stock,
        enabled: updatedItem.enabled
      }
    });
  } catch (error) {
    logger.error("Error updating shop item:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to update shop item"
    });
  }
});
router.delete("/:guildId/economy/shop-items/:itemId", async (req, res) => {
  const { guildId, itemId } = req.params;
  try {
    const db = getDatabase();
    const [existingItem] = await db.select().from(economyShopItems).where(and(eq(economyShopItems.id, itemId), eq(economyShopItems.guildId, guildId))).limit(1);
    if (!existingItem) {
      return res.status(404).json({
        error: "Not Found",
        message: "Shop item not found"
      });
    }
    await db.delete(economyShopItems).where(and(eq(economyShopItems.id, itemId), eq(economyShopItems.guildId, guildId)));
    logger.info(`Deleted shop item ${itemId} from guild ${guildId}`);
    return res.json({
      success: true,
      message: "Shop item deleted successfully"
    });
  } catch (error) {
    logger.error("Error deleting shop item:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to delete shop item"
    });
  }
});
router.patch("/:guildId/economy/settings", async (req, res) => {
  const { guildId } = req.params;
  try {
    const validation = economySettingsSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "Validation Error",
        message: "Invalid request body",
        details: validation.error.errors
      });
    }
    const updates = validation.data;
    const settingsUpdates = {};
    if (updates.currencyName !== void 0) settingsUpdates.currencyName = updates.currencyName;
    if (updates.currencySymbol !== void 0)
      settingsUpdates.currencySymbol = updates.currencySymbol;
    if (updates.startingBalance !== void 0)
      settingsUpdates.startingBalance = updates.startingBalance;
    if (updates.dailyAmount !== void 0) settingsUpdates.dailyAmount = updates.dailyAmount;
    if (updates.dailyStreakBonus !== void 0)
      settingsUpdates.dailyStreakBonus = updates.dailyStreakBonus;
    if (updates.workCooldown !== void 0) settingsUpdates.workCooldown = updates.workCooldown;
    if (updates.workRewardMin !== void 0) settingsUpdates.workMinAmount = updates.workRewardMin;
    if (updates.workRewardMax !== void 0) settingsUpdates.workMaxAmount = updates.workRewardMax;
    if (updates.robEnabled !== void 0) settingsUpdates.robEnabled = updates.robEnabled;
    if (updates.robCooldown !== void 0) settingsUpdates.robCooldown = updates.robCooldown;
    if (updates.robSuccessRate !== void 0)
      settingsUpdates.robSuccessRate = updates.robSuccessRate;
    if (updates.robMinAmount !== void 0) settingsUpdates.robMinAmount = updates.robMinAmount;
    if (updates.maxBet !== void 0) settingsUpdates.maxBet = updates.maxBet;
    if (updates.minBet !== void 0) settingsUpdates.minBet = updates.minBet;
    if (Object.keys(settingsUpdates).length === 0) {
      return res.status(400).json({
        error: "Bad Request",
        message: "No updatable economy settings were provided"
      });
    }
    settingsUpdates.updatedAt = /* @__PURE__ */ new Date();
    await economyRepository.ensureSettings(guildId);
    const updated = await economyRepository.updateSettings(guildId, settingsUpdates);
    logger.info(`Economy settings updated for guild ${guildId}`);
    return res.json({
      success: true,
      settings: updated
    });
  } catch (error) {
    logger.error("Error updating economy settings:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to update economy settings"
    });
  }
});
router.post("/:guildId/economy/reset", async (req, res) => {
  const { guildId } = req.params;
  const { resetBalances = true, resetShop = false, resetTransactions = true } = req.body;
  try {
    const db = getDatabase();
    await db.transaction(async (tx) => {
      if (resetBalances) {
        await tx.delete(economyBalances).where(eq(economyBalances.guildId, guildId));
        logger.info(`Reset economy balances for guild ${guildId}`);
      }
      if (resetShop) {
        await tx.delete(economyShopItems).where(eq(economyShopItems.guildId, guildId));
        logger.info(`Reset shop items for guild ${guildId}`);
      }
      if (resetTransactions) {
        await tx.delete(economyTransactions).where(eq(economyTransactions.guildId, guildId));
        logger.info(`Reset transactions for guild ${guildId}`);
      }
    });
    return res.json({
      success: true,
      message: "Economy data reset successfully",
      reset: {
        balances: resetBalances,
        shop: resetShop,
        transactions: resetTransactions
      }
    });
  } catch (error) {
    logger.error("Error resetting economy data:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to reset economy data"
    });
  }
});
export const economyRouter = router;
