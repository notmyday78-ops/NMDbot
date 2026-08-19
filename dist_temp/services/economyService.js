"use strict";
import { economyRepository } from "../repositories/economyRepository";
import { t } from "../i18n";
import { client } from "../index";
import { logger } from "../utils/logger";
export class EconomyService {
  // Balance management
  async getOrCreateBalance(userId, guildId) {
    let balance = await economyRepository.getBalance(userId, guildId);
    if (!balance) {
      const settings = await economyRepository.ensureSettings(guildId);
      balance = await economyRepository.createBalance({
        userId,
        guildId,
        balance: settings.startingBalance
      });
    }
    return balance;
  }
  async addMoney(userId, guildId, amount, type, description, metadata) {
    try {
      await this.getOrCreateBalance(userId, guildId);
      const updatedBalance = await economyRepository.addToBalance(userId, guildId, amount);
      if (!updatedBalance) {
        if (amount < 0) {
          return { success: false, error: t("commands.economy.errors.insufficientFunds") };
        }
        return { success: false, error: t("commands.economy.errors.general") };
      }
      const transaction = await economyRepository.createTransaction({
        userId,
        guildId,
        type,
        amount,
        description,
        metadata: metadata ?? void 0
      });
      return { success: true, balance: updatedBalance, transaction };
    } catch (error) {
      console.error("Error adding money:", error);
      return { success: false, error: t("commands.economy.errors.general") };
    }
  }
  async transferMoney(fromUserId, toUserId, guildId, amount, description) {
    try {
      const fromBalance = await this.getOrCreateBalance(fromUserId, guildId);
      if (fromBalance.balance < amount) {
        return { success: false, error: t("commands.economy.errors.insufficientFunds") };
      }
      const senderResult = await this.addMoney(
        fromUserId,
        guildId,
        -amount,
        "transfer",
        description || `Transfer to user`,
        { relatedUserId: toUserId }
      );
      if (!senderResult.success) {
        return senderResult;
      }
      const receiverResult = await this.addMoney(
        toUserId,
        guildId,
        amount,
        "transfer",
        description || `Transfer from user`,
        { relatedUserId: fromUserId }
      );
      if (!receiverResult.success) {
        await this.addMoney(fromUserId, guildId, amount, "transfer_revert", "Transfer failed");
        return receiverResult;
      }
      return senderResult;
    } catch (error) {
      console.error("Error transferring money:", error);
      return { success: false, error: t("commands.economy.errors.general") };
    }
  }
  // Daily rewards
  async claimDaily(userId, guildId) {
    try {
      const isOnCooldown = await economyRepository.isOnCooldown(userId, guildId, "daily");
      if (isOnCooldown) {
        const cooldown = await economyRepository.getCooldown(userId, guildId, "daily");
        if (!cooldown) {
          return { success: false, error: t("common.error") };
        }
        const timeLeft = cooldown.nextAvailable.getTime() - Date.now();
        const hours = Math.floor(timeLeft / 1e3 / 60 / 60);
        const minutes = Math.floor(timeLeft / 1e3 / 60 % 60);
        return {
          success: false,
          error: t("commands.economy.daily.cooldown", { hours, minutes })
        };
      }
      const settings = await economyRepository.ensureSettings(guildId);
      const lastCooldown = await economyRepository.getCooldown(userId, guildId, "daily");
      let streakDays = 1;
      let totalAmount = settings.dailyAmount;
      if (lastCooldown && settings.dailyStreak) {
        const lastClaimTime = lastCooldown.lastUsed.getTime();
        const timeSinceLastClaim = Date.now() - lastClaimTime;
        const oneDayMs = 24 * 60 * 60 * 1e3;
        if (timeSinceLastClaim < oneDayMs * 2) {
          streakDays = lastCooldown.streakDays + 1;
          totalAmount += settings.dailyStreakBonus * (streakDays - 1);
        }
      }
      const now = /* @__PURE__ */ new Date();
      const nextAvailable = new Date(now.getTime() + 24 * 60 * 60 * 1e3);
      await economyRepository.setCooldown({
        userId,
        guildId,
        commandType: "daily",
        lastUsed: now,
        nextAvailable,
        streakDays
      });
      const result = await this.addMoney(
        userId,
        guildId,
        totalAmount,
        "daily",
        `Daily reward (${streakDays} day streak)`,
        { streakDays }
      );
      return result;
    } catch (error) {
      console.error("Error claiming daily:", error);
      return { success: false, error: t("commands.economy.errors.general") };
    }
  }
  // Work command
  async work(userId, guildId) {
    try {
      const settings = await economyRepository.ensureSettings(guildId);
      const isOnCooldown = await economyRepository.isOnCooldown(userId, guildId, "work");
      if (isOnCooldown) {
        const cooldown = await economyRepository.getCooldown(userId, guildId, "work");
        if (!cooldown) {
          return { success: false, error: t("common.error") };
        }
        const timeLeft = cooldown.nextAvailable.getTime() - Date.now();
        const minutes = Math.floor(timeLeft / 1e3 / 60);
        const seconds = Math.floor(timeLeft / 1e3 % 60);
        return { success: false, error: t("commands.economy.work.cooldown", { minutes, seconds }) };
      }
      const amount = Math.floor(
        Math.random() * (settings.workMaxAmount - settings.workMinAmount + 1) + settings.workMinAmount
      );
      const now = /* @__PURE__ */ new Date();
      const nextAvailable = new Date(now.getTime() + settings.workCooldown * 1e3);
      await economyRepository.setCooldown({
        userId,
        guildId,
        commandType: "work",
        lastUsed: now,
        nextAvailable
      });
      const workJobKeys = [
        "programmer",
        "pizza",
        "store",
        "freelance",
        "lawn",
        "lemonade",
        "dogwalker",
        "tutor"
      ];
      const jobKey = workJobKeys[Math.floor(Math.random() * workJobKeys.length)];
      const description = t(`commands.economy.work.jobs.${jobKey}`);
      return await this.addMoney(userId, guildId, amount, "work", description);
    } catch (error) {
      console.error("Error working:", error);
      return { success: false, error: t("commands.economy.errors.general") };
    }
  }
  // Rob command
  async rob(robberId, victimId, guildId) {
    try {
      const settings = await economyRepository.ensureSettings(guildId);
      if (!settings.robEnabled) {
        return { success: false, error: t("commands.economy.rob.disabled") };
      }
      const isOnCooldown = await economyRepository.isOnCooldown(robberId, guildId, "rob");
      if (isOnCooldown) {
        const cooldown = await economyRepository.getCooldown(robberId, guildId, "rob");
        if (!cooldown) {
          return { success: false, error: t("common.error") };
        }
        const timeLeft = cooldown.nextAvailable.getTime() - Date.now();
        const hours = Math.floor(timeLeft / 1e3 / 60 / 60);
        const minutes = Math.floor(timeLeft / 1e3 / 60 % 60);
        return { success: false, error: t("commands.economy.rob.cooldown", { hours, minutes }) };
      }
      const hasProtection = await economyRepository.hasActiveProtection(victimId, guildId);
      if (hasProtection) {
        const now2 = /* @__PURE__ */ new Date();
        const nextAvailable2 = new Date(now2.getTime() + settings.robCooldown * 1e3);
        await economyRepository.setCooldown({
          userId: robberId,
          guildId,
          commandType: "rob",
          lastUsed: now2,
          nextAvailable: nextAvailable2
        });
        return {
          success: false,
          protected: true,
          error: t("commands.economy.rob.protectedText", { user: "" })
        };
      }
      const victimBalance = await this.getOrCreateBalance(victimId, guildId);
      if (victimBalance.balance < settings.robMinAmount) {
        return { success: false, error: t("commands.economy.rob.notEnoughMoney") };
      }
      const now = /* @__PURE__ */ new Date();
      const nextAvailable = new Date(now.getTime() + settings.robCooldown * 1e3);
      await economyRepository.setCooldown({
        userId: robberId,
        guildId,
        commandType: "rob",
        lastUsed: now,
        nextAvailable
      });
      const successRoll = Math.random() * 100;
      const success = successRoll < settings.robSuccessRate;
      if (success) {
        const percentage = Math.random() * 0.4 + 0.1;
        let amount = Math.floor(victimBalance.balance * percentage);
        const robberBalance = await this.getOrCreateBalance(robberId, guildId);
        const maxSteal = Math.floor(robberBalance.balance * 0.5);
        amount = Math.min(amount, maxSteal);
        if (amount <= 0) {
          return { success: false, error: t("commands.economy.rob.notEnoughMoney") };
        }
        await this.addMoney(victimId, guildId, -amount, "rob", "Got robbed", { robberId });
        const robberResult = await this.addMoney(
          robberId,
          guildId,
          amount,
          "rob",
          "Successful robbery",
          { victimId }
        );
        const updatedVictimBalance = await economyRepository.getBalance(victimId, guildId);
        return {
          success: true,
          amount,
          victimBalance: updatedVictimBalance ?? {},
          robberBalance: robberResult.balance ?? {}
        };
      } else {
        const robberBalance = await this.getOrCreateBalance(robberId, guildId);
        const fine = Math.floor(robberBalance.balance * 0.2);
        if (fine > 0) {
          const result = await this.addMoney(
            robberId,
            guildId,
            -fine,
            "rob",
            "Failed robbery fine",
            { victimId }
          );
          return {
            success: false,
            amount: -fine,
            robberBalance: result.balance ?? robberBalance,
            error: `${t("commands.economy.rob.failedText", {
              user: ""
            })} (${fine} ${settings.currencyName})`
          };
        }
        return { success: false, error: t("commands.economy.rob.failedText", { user: "" }) };
      }
    } catch (error) {
      console.error("Error robbing:", error);
      return { success: false, error: t("commands.economy.errors.general") };
    }
  }
  // Shop operations
  async purchaseItem(userId, guildId, itemId, quantity = 1) {
    try {
      const item = await economyRepository.getShopItem(itemId);
      if (!item || item.guildId !== guildId) {
        return { success: false, error: t("commands.economy.errors.itemNotFound") };
      }
      if (!item.enabled) {
        return { success: false, error: t("commands.economy.errors.itemNotFound") };
      }
      if (item.stock !== null && item.stock !== -1 && item.stock < quantity) {
        return { success: false, error: t("commands.economy.errors.notEnoughStock") };
      }
      const totalCost = item.price * quantity;
      const balance = await this.getOrCreateBalance(userId, guildId);
      if (balance.balance < totalCost) {
        return { success: false, error: t("commands.economy.errors.insufficientFunds") };
      }
      if (item.requiresRole) {
        try {
          const guild = client.guilds.cache.get(guildId);
          if (guild) {
            const member = await guild.members.fetch(userId).catch(() => null);
            if (member && !member.roles.cache.has(item.requiresRole)) {
              return { success: false, error: t("commands.economy.errors.missingRole") };
            }
          }
        } catch (err) {
          logger.error("Failed to check role requirements for shop item:", err);
        }
      }
      const transactionResult = await this.addMoney(
        userId,
        guildId,
        -totalCost,
        "shop",
        `Purchased ${quantity}x ${item.name}`,
        { itemId, quantity }
      );
      if (!transactionResult.success) {
        return { success: false, error: transactionResult.error };
      }
      if (item.stock !== null && item.stock !== -1) {
        const stockConsumed = await economyRepository.consumeShopItemStock(itemId, quantity);
        if (!stockConsumed) {
          await this.addMoney(
            userId,
            guildId,
            totalCost,
            "shop_refund",
            `Refund for failed purchase of ${item.name}`
          );
          return { success: false, error: t("commands.economy.errors.notEnoughStock") };
        }
      }
      const existingItem = await economyRepository.getUserItem(userId, guildId, itemId);
      let expiresAt;
      if (item.effectType === "rob_protection" && item.effectValue) {
        const effectValue = item.effectValue;
        const duration = effectValue.duration ?? 86400;
        expiresAt = new Date(Date.now() + duration * 1e3);
      }
      let userItem;
      if (existingItem) {
        const updatedItem = await economyRepository.updateUserItem(existingItem.id, {
          quantity: existingItem.quantity + quantity,
          expiresAt: expiresAt ?? existingItem.expiresAt
        });
        if (!updatedItem) {
          await this.addMoney(userId, guildId, totalCost, "shop_refund", `Refund`);
          if (item.stock !== null && item.stock !== -1) {
            await economyRepository.updateShopItem(itemId, {
              stock: item.stock - quantity + quantity
            });
          }
          return { success: false, error: t("commands.economy.errors.general") };
        }
        userItem = updatedItem;
      } else {
        userItem = await economyRepository.addUserItem({
          userId,
          guildId,
          itemId,
          quantity,
          expiresAt
        });
      }
      return {
        success: true,
        item: userItem,
        balance: transactionResult.balance ?? {}
      };
    } catch (error) {
      console.error("Error purchasing item:", error);
      return { success: false, error: t("commands.economy.errors.general") };
    }
  }
  // Gambling helpers
  async canAffordBet(userId, guildId, amount) {
    const balance = await this.getOrCreateBalance(userId, guildId);
    const settings = await economyRepository.ensureSettings(guildId);
    if (amount < settings.minBet || amount > settings.maxBet) {
      return { canAfford: false };
    }
    return {
      canAfford: balance.balance >= amount,
      balance,
      settings
    };
  }
  async processGamble(userId, guildId, gameType, wagered, won, multiplier, details) {
    const payout = won ? Math.floor(wagered * multiplier) : 0;
    const profit = payout - wagered;
    const balanceResult = await this.addMoney(
      userId,
      guildId,
      profit,
      "gamble",
      `${gameType} - ${won ? "Won" : "Lost"}`,
      { gameType, wagered, payout, won, details: details ?? void 0 }
    );
    await economyRepository.addToBalance(userId, guildId, 0);
    await economyRepository.updateBalance(userId, guildId, {
      totalGambled: ((await economyRepository.getBalance(userId, guildId))?.totalGambled ?? 0) + wagered
    });
    const stats = await economyRepository.updateGamblingStats(
      userId,
      guildId,
      gameType,
      won,
      wagered,
      payout
    );
    return {
      won,
      payout,
      profit,
      balance: balanceResult.balance ?? {},
      stats,
      details: details ?? void 0
    };
  }
  // Leaderboard
  async getLeaderboard(guildId, limit = 10) {
    return await economyRepository.getTopBalances(guildId, limit);
  }
  // Settings
  async getSettings(guildId) {
    return await economyRepository.ensureSettings(guildId);
  }
  async updateSettings(guildId, updates) {
    return await economyRepository.updateSettings(guildId, updates);
  }
}
export const economyService = new EconomyService();
