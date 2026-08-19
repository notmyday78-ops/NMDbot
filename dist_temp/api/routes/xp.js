"use strict";
import { Router } from "express";
import { getDatabase } from "../../database/connection";
import { guildSettings, xpRewards, members } from "../../database/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "../../utils/logger";
import { z } from "zod";
const router = Router();
const xpSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  xpRate: z.number().min(1).max(100).optional(),
  xpCooldown: z.number().min(0).max(3600).optional(),
  levelUpMessage: z.string().max(500).optional(),
  levelUpChannel: z.string().optional(),
  announceLevelUp: z.boolean().optional(),
  xpBlacklistRoles: z.array(z.string()).optional(),
  xpBlacklistChannels: z.array(z.string()).optional(),
  xpMultiplierRoles: z.record(z.string(), z.number()).optional()
});
const roleRewardSchema = z.object({
  level: z.number().min(1).max(1e3),
  roleId: z.string()
});
router.patch("/:guildId/xp/settings", async (req, res) => {
  const { guildId } = req.params;
  try {
    const validation = xpSettingsSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "Validation Error",
        message: "Invalid request body",
        details: validation.error.errors
      });
    }
    const db = getDatabase();
    const updates = validation.data;
    const [existingSettings] = await db.select().from(guildSettings).where(eq(guildSettings.guildId, guildId)).limit(1);
    if (!existingSettings) {
      await db.insert(guildSettings).values({
        guildId,
        xpEnabled: updates.enabled,
        xpPerMessage: updates.xpRate,
        xpCooldown: updates.xpCooldown,
        levelUpMessage: updates.levelUpMessage,
        levelUpChannel: updates.levelUpChannel,
        xpAnnounceLevelUp: updates.announceLevelUp,
        createdAt: /* @__PURE__ */ new Date(),
        updatedAt: /* @__PURE__ */ new Date()
      });
    } else {
      const updateData = {
        updatedAt: /* @__PURE__ */ new Date()
      };
      if (updates.enabled !== void 0) updateData.xpEnabled = updates.enabled;
      if (updates.xpRate !== void 0) updateData.xpPerMessage = updates.xpRate;
      if (updates.xpCooldown !== void 0) updateData.xpCooldown = updates.xpCooldown;
      if (updates.levelUpMessage !== void 0) updateData.levelUpMessage = updates.levelUpMessage;
      if (updates.levelUpChannel !== void 0) updateData.levelUpChannel = updates.levelUpChannel;
      if (updates.announceLevelUp !== void 0)
        updateData.xpAnnounceLevelUp = updates.announceLevelUp;
      await db.update(guildSettings).set(updateData).where(eq(guildSettings.guildId, guildId));
    }
    logger.info(`Updated XP settings for guild ${guildId}`);
    return res.json({
      success: true,
      message: "XP settings updated successfully"
    });
  } catch (error) {
    logger.error("Error updating XP settings:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to update XP settings"
    });
  }
});
router.post("/:guildId/xp/rewards", async (req, res) => {
  const { guildId } = req.params;
  try {
    const validation = roleRewardSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "Validation Error",
        message: "Invalid request body",
        details: validation.error.errors
      });
    }
    const db = getDatabase();
    const { level, roleId } = validation.data;
    const [existingReward] = await db.select().from(xpRewards).where(and(eq(xpRewards.guildId, guildId), eq(xpRewards.level, level))).limit(1);
    if (existingReward) {
      return res.status(409).json({
        error: "Conflict",
        message: `A role reward already exists for level ${level}`
      });
    }
    const [newReward] = await db.insert(xpRewards).values({
      guildId,
      level,
      roleId,
      createdAt: /* @__PURE__ */ new Date()
    }).returning();
    logger.info(`Created XP role reward for level ${level} in guild ${guildId}`);
    return res.status(201).json({
      success: true,
      reward: {
        level: newReward.level,
        roleId: newReward.roleId
      }
    });
  } catch (error) {
    logger.error("Error creating role reward:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to create role reward"
    });
  }
});
router.delete("/:guildId/xp/rewards/:level", async (req, res) => {
  const { guildId, level } = req.params;
  try {
    const db = getDatabase();
    const [existingReward] = await db.select().from(xpRewards).where(and(eq(xpRewards.level, parseInt(level)), eq(xpRewards.guildId, guildId))).limit(1);
    if (!existingReward) {
      return res.status(404).json({
        error: "Not Found",
        message: "Role reward not found"
      });
    }
    await db.delete(xpRewards).where(and(eq(xpRewards.level, parseInt(level)), eq(xpRewards.guildId, guildId)));
    logger.info(`Deleted XP role reward for level ${level} from guild ${guildId}`);
    return res.json({
      success: true,
      message: "Role reward deleted successfully"
    });
  } catch (error) {
    logger.error("Error deleting role reward:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to delete role reward"
    });
  }
});
router.post("/:guildId/xp/reset", async (req, res) => {
  const { guildId } = req.params;
  const { resetLevels = true, resetRewards = false, keepSettings = true } = req.body;
  try {
    const db = getDatabase();
    await db.transaction(async (tx) => {
      if (resetLevels) {
        await tx.update(members).set({
          xp: 0,
          level: 0,
          messages: 0
        }).where(eq(members.guildId, guildId));
        logger.info(`Reset XP levels for all members in guild ${guildId}`);
      }
      if (resetRewards) {
        await tx.delete(xpRewards).where(eq(xpRewards.guildId, guildId));
        logger.info(`Reset XP role rewards for guild ${guildId}`);
      }
      if (!keepSettings) {
        await tx.update(guildSettings).set({
          xpEnabled: true,
          xpPerMessage: 15,
          xpCooldown: 60,
          levelUpMessage: "Congratulations {user}! You've reached level {level}!",
          levelUpChannel: null,
          xpAnnounceLevelUp: true,
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq(guildSettings.guildId, guildId));
        logger.info(`Reset XP settings for guild ${guildId}`);
      }
    });
    return res.json({
      success: true,
      message: "XP data reset successfully",
      reset: {
        levels: resetLevels,
        rewards: resetRewards,
        settings: !keepSettings
      }
    });
  } catch (error) {
    logger.error("Error resetting XP data:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to reset XP data"
    });
  }
});
router.get("/:guildId/xp/user/:userId", async (req, res) => {
  const { guildId, userId } = req.params;
  try {
    const db = getDatabase();
    const [member] = await db.select().from(members).where(and(eq(members.guildId, guildId), eq(members.userId, userId))).limit(1);
    if (!member) {
      return res.status(404).json({
        error: "Not Found",
        message: "Member not found"
      });
    }
    const currentLevelXp = member.level * member.level * 100;
    const nextLevelXp = (member.level + 1) * (member.level + 1) * 100;
    const xpProgress = member.xp - currentLevelXp;
    const xpNeeded = nextLevelXp - currentLevelXp;
    return res.json({
      userId: member.userId,
      xp: member.xp,
      level: member.level,
      messages: member.messages,
      xpProgress,
      xpNeeded,
      progressPercentage: Math.floor(xpProgress / xpNeeded * 100),
      lastXpGain: null
    });
  } catch (error) {
    logger.error("Error fetching user XP:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch user XP data"
    });
  }
});
router.patch("/:guildId/xp/user/:userId", async (req, res) => {
  const { guildId, userId } = req.params;
  const { xp, level, addXp, addLevel } = req.body;
  try {
    const db = getDatabase();
    const [member] = await db.select().from(members).where(and(eq(members.guildId, guildId), eq(members.userId, userId))).limit(1);
    if (!member) {
      await db.insert(members).values({
        guildId,
        userId,
        xp: xp || 0,
        level: level || 0,
        messages: 0,
        joinedAt: /* @__PURE__ */ new Date()
      });
    } else {
      const updateData = {};
      if (xp !== void 0) {
        updateData.xp = xp;
      } else if (addXp !== void 0) {
        updateData.xp = member.xp + addXp;
      }
      if (level !== void 0) {
        updateData.level = level;
      } else if (addLevel !== void 0) {
        updateData.level = member.level + addLevel;
      }
      await db.update(members).set(updateData).where(and(eq(members.guildId, guildId), eq(members.userId, userId)));
    }
    logger.info(`Manually adjusted XP for user ${userId} in guild ${guildId}`);
    return res.json({
      success: true,
      message: "User XP updated successfully"
    });
  } catch (error) {
    logger.error("Error updating user XP:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to update user XP"
    });
  }
});
export const xpRouter = router;
