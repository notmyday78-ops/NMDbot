"use strict";
import { Router } from "express";
import { client } from "../../index";
import { getDatabase } from "../../database/connection";
import { modCases, guildSettings } from "../../database/schema";
import { eq } from "drizzle-orm";
import { logger } from "../../utils/logger";
import { z } from "zod";
import { PermissionFlagsBits } from "discord.js";
import { warningService } from "../../services/warningService";
import { moderationScheduler } from "../../services/moderationScheduler";
const router = Router();
const warnSchema = z.object({
  userId: z.string(),
  moderatorId: z.string(),
  reason: z.string().min(1).max(500),
  level: z.number().min(1).max(5).optional()
});
const banSchema = z.object({
  userId: z.string(),
  moderatorId: z.string(),
  reason: z.string().min(1).max(500),
  duration: z.number().optional(),
  // Duration in days for temp ban
  deleteMessageDays: z.number().min(0).max(7).optional()
});
const kickSchema = z.object({
  userId: z.string(),
  moderatorId: z.string(),
  reason: z.string().min(1).max(500)
});
const muteSchema = z.object({
  userId: z.string(),
  moderatorId: z.string(),
  reason: z.string().min(1).max(500),
  duration: z.number().min(1).optional()
  // Duration in minutes
});
const moderationSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  autoModEnabled: z.boolean().optional(),
  logChannelId: z.string().optional(),
  muteRoleId: z.string().optional(),
  warnThresholdBan: z.number().min(1).optional(),
  warnThresholdMute: z.number().min(1).optional(),
  antiSpamEnabled: z.boolean().optional(),
  antiLinksEnabled: z.boolean().optional(),
  antiInvitesEnabled: z.boolean().optional()
});
async function logModAction(guildId, userId, moderatorId, type, reason, durationSeconds) {
  const db = getDatabase();
  const expiresAt = durationSeconds && durationSeconds > 0 ? new Date(Date.now() + durationSeconds * 1e3) : null;
  const [newCase] = await db.insert(modCases).values({
    guildId,
    userId,
    moderatorId,
    type,
    reason,
    duration: durationSeconds ?? null,
    expiresAt,
    createdAt: /* @__PURE__ */ new Date()
  }).returning();
  if (type === "ban" && expiresAt) {
    await moderationScheduler.scheduleTempAction({
      caseId: newCase.id,
      guildId,
      userId,
      expiresAt,
      type: "ban"
    });
  }
  return newCase.id;
}
async function requireModeratorPermission(guild, moderatorId, permission) {
  const member = await guild.members.fetch(moderatorId).catch(() => null);
  if (!member) {
    return {
      member: null,
      error: { status: 404, message: "Moderator not found in guild" }
    };
  }
  if (!member.permissions.has(permission)) {
    return {
      member: null,
      error: { status: 403, message: "Moderator lacks the required permission" }
    };
  }
  return { member };
}
router.post("/:guildId/moderation/warn", async (req, res) => {
  const { guildId } = req.params;
  try {
    const validation = warnSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "Validation Error",
        message: "Invalid request body",
        details: validation.error.errors
      });
    }
    const { userId, moderatorId, reason, level = 1 } = validation.data;
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      return res.status(404).json({
        error: "Not Found",
        message: "Guild not found"
      });
    }
    const user = await client.users.fetch(userId).catch(() => null);
    const moderator = await client.users.fetch(moderatorId).catch(() => null);
    if (!user || !moderator) {
      return res.status(404).json({
        error: "Not Found",
        message: "User or moderator not found"
      });
    }
    const warnPermission = await requireModeratorPermission(
      guild,
      moderatorId,
      PermissionFlagsBits.ModerateMembers
    );
    if (warnPermission.error) {
      return res.status(warnPermission.error.status).json({
        error: "Forbidden",
        message: warnPermission.error.message
      });
    }
    const warning = await warningService.createWarning(
      guild,
      user,
      moderator,
      reason,
      void 0,
      level
    );
    const caseId = await logModAction(guildId, userId, moderatorId, "warn", reason);
    try {
      await user.send({
        embeds: [
          {
            title: "\u26A0\uFE0F Warning Received",
            description: `You have been warned in **${guild.name}**`,
            fields: [
              { name: "Reason", value: reason, inline: false },
              { name: "Level", value: level.toString(), inline: true }
            ],
            color: 16763904,
            timestamp: (/* @__PURE__ */ new Date()).toISOString()
          }
        ]
      });
    } catch (error) {
      logger.warn(`Could not DM user ${userId} about warning`);
    }
    logger.info(`User ${userId} warned in guild ${guildId} by ${moderatorId}`);
    return res.json({
      success: true,
      warning: {
        id: warning.warnId,
        caseId,
        userId,
        moderatorId,
        reason,
        level,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }
    });
  } catch (error) {
    logger.error("Error issuing warning:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to issue warning"
    });
  }
});
router.post("/:guildId/moderation/ban", async (req, res) => {
  const { guildId } = req.params;
  try {
    const validation = banSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "Validation Error",
        message: "Invalid request body",
        details: validation.error.errors
      });
    }
    const { userId, moderatorId, reason, duration, deleteMessageDays = 0 } = validation.data;
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      return res.status(404).json({
        error: "Not Found",
        message: "Guild not found"
      });
    }
    const botMember = guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.BanMembers)) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Bot does not have permission to ban members"
      });
    }
    const banPermission = await requireModeratorPermission(
      guild,
      moderatorId,
      PermissionFlagsBits.BanMembers
    );
    if (banPermission.error) {
      return res.status(banPermission.error.status).json({
        error: "Forbidden",
        message: banPermission.error.message
      });
    }
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) {
      return res.status(404).json({
        error: "Not Found",
        message: "User not found"
      });
    }
    try {
      await user.send({
        embeds: [
          {
            title: "\u{1F528} You have been banned",
            description: `You have been banned from **${guild.name}**`,
            fields: [
              { name: "Reason", value: reason, inline: false },
              {
                name: "Duration",
                value: duration ? `${duration} days` : "Permanent",
                inline: true
              }
            ],
            color: 16711680,
            timestamp: (/* @__PURE__ */ new Date()).toISOString()
          }
        ]
      });
    } catch (error) {
      logger.warn(`Could not DM user ${userId} about ban`);
    }
    await guild.members.ban(userId, {
      reason: `${reason} | Banned by ${moderatorId}`,
      deleteMessageSeconds: deleteMessageDays * 24 * 60 * 60
    });
    const durationSeconds = duration ? duration * 86400 : void 0;
    const caseId = await logModAction(guildId, userId, moderatorId, "ban", reason, durationSeconds);
    if (duration) {
      const unbanDate = /* @__PURE__ */ new Date();
      unbanDate.setDate(unbanDate.getDate() + duration);
    }
    logger.info(`User ${userId} banned from guild ${guildId} by ${moderatorId}`);
    return res.json({
      success: true,
      ban: {
        caseId,
        userId,
        moderatorId,
        reason,
        duration,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }
    });
  } catch (error) {
    logger.error("Error banning user:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to ban user"
    });
  }
});
router.post("/:guildId/moderation/kick", async (req, res) => {
  const { guildId } = req.params;
  try {
    const validation = kickSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "Validation Error",
        message: "Invalid request body",
        details: validation.error.errors
      });
    }
    const { userId, moderatorId, reason } = validation.data;
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      return res.status(404).json({
        error: "Not Found",
        message: "Guild not found"
      });
    }
    const botMember = guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.KickMembers)) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Bot does not have permission to kick members"
      });
    }
    const kickPermission = await requireModeratorPermission(
      guild,
      moderatorId,
      PermissionFlagsBits.KickMembers
    );
    if (kickPermission.error) {
      return res.status(kickPermission.error.status).json({
        error: "Forbidden",
        message: kickPermission.error.message
      });
    }
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) {
      return res.status(404).json({
        error: "Not Found",
        message: "Member not found in guild"
      });
    }
    if (!member.kickable) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Cannot kick this member (higher role or owner)"
      });
    }
    try {
      await member.send({
        embeds: [
          {
            title: "\u{1F462} You have been kicked",
            description: `You have been kicked from **${guild.name}**`,
            fields: [{ name: "Reason", value: reason, inline: false }],
            color: 16753920,
            timestamp: (/* @__PURE__ */ new Date()).toISOString()
          }
        ]
      });
    } catch (error) {
      logger.warn(`Could not DM user ${userId} about kick`);
    }
    await member.kick(`${reason} | Kicked by ${moderatorId}`);
    const caseId = await logModAction(guildId, userId, moderatorId, "kick", reason);
    logger.info(`User ${userId} kicked from guild ${guildId} by ${moderatorId}`);
    return res.json({
      success: true,
      kick: {
        caseId,
        userId,
        moderatorId,
        reason,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }
    });
  } catch (error) {
    logger.error("Error kicking user:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to kick user"
    });
  }
});
router.post("/:guildId/moderation/mute", async (req, res) => {
  const { guildId } = req.params;
  try {
    const validation = muteSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "Validation Error",
        message: "Invalid request body",
        details: validation.error.errors
      });
    }
    const { userId, moderatorId, reason, duration } = validation.data;
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      return res.status(404).json({
        error: "Not Found",
        message: "Guild not found"
      });
    }
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) {
      return res.status(404).json({
        error: "Not Found",
        message: "Member not found in guild"
      });
    }
    const botMember = guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Bot does not have permission to manage roles"
      });
    }
    const mutePermission = await requireModeratorPermission(
      guild,
      moderatorId,
      PermissionFlagsBits.ManageRoles
    );
    if (mutePermission.error) {
      return res.status(mutePermission.error.status).json({
        error: "Forbidden",
        message: mutePermission.error.message
      });
    }
    await guild.roles.fetch();
    let muteRole = guild.roles.cache.find((r) => r.name === "Muted");
    if (!muteRole) {
      muteRole = await guild.roles.create({
        name: "Muted",
        color: 8421504,
        permissions: [],
        reason: "Auto-created mute role"
      });
      await guild.channels.fetch();
      for (const channel of guild.channels.cache.values()) {
        if (channel.isTextBased() && "permissionOverwrites" in channel) {
          await channel.permissionOverwrites.create(muteRole.id, {
            SendMessages: false,
            AddReactions: false,
            Speak: false
          }).catch(() => {
          });
        }
      }
    }
    await member.roles.add(muteRole, `${reason} | Muted by ${moderatorId}`);
    const muteDurationSeconds = duration ? duration * 60 : void 0;
    const caseId = await logModAction(
      guildId,
      userId,
      moderatorId,
      "mute",
      reason,
      muteDurationSeconds
    );
    if (duration) {
      setTimeout(
        async () => {
          try {
            await member.roles.remove(muteRole.id, "Mute duration expired");
            logger.info(`Unmuted user ${userId} in guild ${guildId} (duration expired)`);
          } catch (error) {
            logger.error(`Failed to unmute user ${userId}:`, error);
          }
        },
        duration * 60 * 1e3
      );
    }
    try {
      await member.send({
        embeds: [
          {
            title: "\u{1F507} You have been muted",
            description: `You have been muted in **${guild.name}**`,
            fields: [
              { name: "Reason", value: reason, inline: false },
              {
                name: "Duration",
                value: duration ? `${duration} minutes` : "Indefinite",
                inline: true
              }
            ],
            color: 8421504,
            timestamp: (/* @__PURE__ */ new Date()).toISOString()
          }
        ]
      });
    } catch (error) {
      logger.warn(`Could not DM user ${userId} about mute`);
    }
    logger.info(`User ${userId} muted in guild ${guildId} by ${moderatorId}`);
    return res.json({
      success: true,
      mute: {
        caseId,
        userId,
        moderatorId,
        reason,
        duration,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }
    });
  } catch (error) {
    logger.error("Error muting user:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to mute user"
    });
  }
});
router.patch("/:guildId/moderation/settings", async (req, res) => {
  const { guildId } = req.params;
  try {
    const validation = moderationSettingsSchema.safeParse(req.body);
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
    const settingUpdates = {
      updatedAt: /* @__PURE__ */ new Date()
    };
    if (updates.antiSpamEnabled !== void 0)
      settingUpdates.antiSpamEnabled = updates.antiSpamEnabled;
    if (updates.logChannelId !== void 0) settingUpdates.logsChannel = updates.logChannelId;
    if (!existingSettings) {
      await db.insert(guildSettings).values({
        guildId,
        antiSpamEnabled: updates.antiSpamEnabled || false,
        logsChannel: updates.logChannelId || null,
        createdAt: /* @__PURE__ */ new Date(),
        updatedAt: /* @__PURE__ */ new Date()
      });
    } else if (Object.keys(settingUpdates).length > 1) {
      await db.update(guildSettings).set(settingUpdates).where(eq(guildSettings.guildId, guildId));
    }
    logger.info(`Updated moderation settings for guild ${guildId}`);
    return res.json({
      success: true,
      message: "Moderation settings updated successfully"
    });
  } catch (error) {
    logger.error("Error updating moderation settings:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to update moderation settings"
    });
  }
});
export const moderationRouter = router;
