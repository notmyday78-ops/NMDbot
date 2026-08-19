"use strict";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ChannelType
} from "discord.js";
import { getDatabase } from "../database/connection";
import { eq, and, desc, gte } from "drizzle-orm";
import { securityLogs, blacklist } from "../database/schema/security";
import { guildSettings } from "../database/schema/guilds";
import { members } from "../database/schema/members";
import { users } from "../database/schema/users";
import { logger } from "../utils/logger";
import { auditLogger } from "../security/audit";
import { CryptoUtils } from "../security/crypto";
import { t } from "../i18n";
const DEFAULT_SECURITY_CONFIG = {
  enabled: true,
  autoModEnabled: true,
  antiSpamEnabled: true,
  antiRaidEnabled: true,
  maxMentions: 5,
  maxDuplicates: 3,
  suspiciousThreshold: 50,
  blacklistSync: false
};
const DEFAULT_GLOBAL_SECURITY_CONFIG = {
  ...DEFAULT_SECURITY_CONFIG,
  blacklistSync: true
};
export class SecurityService {
  static instance;
  securityChannel;
  blacklistCache = /* @__PURE__ */ new Map();
  lastBlacklistSync = 0;
  static BLACKLIST_CACHE_TTL = 5 * 60 * 1e3;
  constructor() {
  }
  static getInstance() {
    if (!this.instance) {
      this.instance = new SecurityService();
    }
    return this.instance;
  }
  /**
   * Initialize security monitoring
   */
  initialize(guild) {
    const channel = guild.channels.cache.find(
      (ch) => ch.name === "security-logs" && ch.type === ChannelType.GuildText
    );
    if (channel) {
      this.securityChannel = channel;
    }
  }
  /**
   * Log security incident
   */
  async logIncident(incident) {
    try {
      await getDatabase().insert(securityLogs).values({
        guildId: incident.guildId,
        userId: incident.userId,
        action: incident.type,
        severity: incident.severity,
        description: incident.description,
        metadata: incident.metadata
      });
      logger.warn(`[SECURITY] ${incident.severity.toUpperCase()}: ${incident.type}`, incident);
      if (this.securityChannel && this.securityChannel.guild.id === incident.guildId) {
        const embed = this.createIncidentEmbed(incident);
        await this.securityChannel.send({ embeds: [embed] });
      }
      if (incident.severity === "high" || incident.severity === "critical") {
        await this.alertAdmins(incident);
      }
    } catch (error) {
      logger.error("Failed to log security incident:", error);
    }
  }
  /**
   * Check user for suspicious activity
   */
  async checkUserSecurity(user, guild) {
    const reasons = [];
    let score = 0;
    const isBlacklisted = await this.isBlacklisted("user", user.id);
    if (isBlacklisted) {
      reasons.push(t("security.reasons.blacklisted", { defaultValue: "User is blacklisted" }));
      score += 100;
    }
    const accountAge = Date.now() - user.createdTimestamp;
    const daysSinceCreation = accountAge / (1e3 * 60 * 60 * 24);
    if (daysSinceCreation < 1) {
      reasons.push(
        t("security.reasons.created24h", { defaultValue: "Account created less than 24 hours ago" })
      );
      score += 30;
    } else if (daysSinceCreation < 7) {
      reasons.push(
        t("security.reasons.created7d", { defaultValue: "Account created less than 7 days ago" })
      );
      score += 15;
    }
    if (this.hasSupiciousUsername(user.username)) {
      reasons.push(
        t("security.reasons.suspiciousUsername", { defaultValue: "Suspicious username pattern" })
      );
      score += 20;
    }
    if (!user.avatar) {
      reasons.push(t("security.reasons.noAvatar", { defaultValue: "No avatar set" }));
      score += 10;
    }
    const recentIncidents = await this.getUserIncidents(user.id, guild.id, 7);
    if (recentIncidents.length > 0) {
      reasons.push(
        t("security.reasons.recentIncidents", {
          count: recentIncidents.length,
          defaultValue: `${recentIncidents.length} recent security incidents`
        })
      );
      score += recentIncidents.length * 10;
    }
    return {
      safe: score < 50,
      reasons,
      score
    };
  }
  /**
   * Detect and handle raid attempts
   */
  async detectRaid(guild) {
    const recentJoins = await this.getRecentJoins(guild.id, 60);
    const thresholds = {
      small: { joins: 10, similarity: 0.8 },
      medium: { joins: 20, similarity: 0.7 },
      large: { joins: 30, similarity: 0.6 }
    };
    const guildSize = guild.memberCount;
    const threshold = guildSize < 100 ? thresholds.small : guildSize < 1e3 ? thresholds.medium : thresholds.large;
    if (recentJoins.length >= threshold.joins) {
      const usernameSimilarity = this.calculateUsernameSimilarity(recentJoins.map((j) => j.username));
      if (usernameSimilarity >= threshold.similarity) {
        await this.handleRaid(guild, recentJoins);
        return true;
      }
    }
    return false;
  }
  /**
   * Handle detected raid
   */
  async handleRaid(guild, raiders) {
    await this.logIncident({
      type: "RAID_DETECTED",
      severity: "critical",
      guildId: guild.id,
      description: t("security.raid.detected", {
        count: raiders.length,
        defaultValue: `Potential raid detected: ${raiders.length} suspicious joins`
      }),
      metadata: {
        userIds: raiders.map((r) => r.userId),
        usernames: raiders.map((r) => r.username)
      }
    });
    const config = await this.getSecurityConfig(guild.id);
    if (config.antiRaidEnabled) {
      await this.enableLockdown(guild);
      for (const raider of raiders) {
        try {
          const member = await guild.members.fetch(raider.userId);
          await member.kick(
            t("security.raid.kickReason", { defaultValue: "Automated raid protection" })
          );
        } catch (error) {
          logger.error(`Failed to kick raider ${raider.userId}:`, error);
        }
      }
    }
  }
  /**
   * Enable server lockdown
   */
  async enableLockdown(guild) {
    try {
      const everyoneRole = guild.roles.everyone;
      await everyoneRole.setPermissions(
        everyoneRole.permissions.remove([
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AddReactions,
          PermissionFlagsBits.Connect
        ])
      );
      await this.logIncident({
        type: "LOCKDOWN_ENABLED",
        severity: "high",
        guildId: guild.id,
        description: t("security.lockdown.description", {
          defaultValue: "Server lockdown enabled due to security threat"
        })
      });
    } catch (error) {
      logger.error("Failed to enable lockdown:", error);
    }
  }
  /**
   * Check and add to blacklist
   */
  async blacklistEntity(type, entityId, reason, addedBy) {
    await getDatabase().insert(blacklist).values({
      entityType: type,
      entityId,
      reason,
      addedBy
    });
    await auditLogger.logAction({
      action: "BLACKLIST_ADD",
      userId: addedBy,
      guildId: "global",
      targetId: entityId,
      details: { type, reason }
    });
    const config = await this.getGlobalSecurityConfig();
    this.addToBlacklistCache(type, entityId);
    if (config.blacklistSync) {
      await this.syncBlacklist(true);
    }
  }
  /**
   * Check if entity is blacklisted
   */
  async isBlacklisted(type, entityId) {
    await this.syncBlacklist();
    const cachedSet = this.blacklistCache.get(type);
    if (cachedSet?.has(entityId)) {
      return true;
    }
    const result = await getDatabase().select().from(blacklist).where(
      and(
        eq(blacklist.entityType, type),
        eq(blacklist.entityId, entityId),
        eq(blacklist.active, true)
      )
    ).limit(1);
    const found = result.length > 0;
    if (found) {
      this.addToBlacklistCache(type, entityId);
    }
    return found;
  }
  /**
   * Validate webhook URL
   */
  validateWebhook(url) {
    const webhookRegex = /^https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w-]+$/;
    return webhookRegex.test(url) && !url.includes("../");
  }
  /**
   * Generate secure verification code
   */
  generateVerificationCode() {
    return CryptoUtils.generateSecureToken(8).toUpperCase();
  }
  /**
   * Create incident embed
   */
  createIncidentEmbed(incident) {
    const colors = {
      low: 65280,
      medium: 16776960,
      high: 16753920,
      critical: 16711680
    };
    const embed = new EmbedBuilder().setColor(colors[incident.severity]).setTitle(
      t("security.embed.title", {
        type: incident.type,
        defaultValue: `Security Incident: ${incident.type}`
      })
    ).setDescription(incident.description).addFields(
      {
        name: t("security.embed.severity", { defaultValue: "Severity" }),
        value: incident.severity.toUpperCase(),
        inline: true
      },
      {
        name: t("security.embed.time", { defaultValue: "Time" }),
        value: (/* @__PURE__ */ new Date()).toLocaleString(),
        inline: true
      }
    ).setTimestamp();
    if (incident.userId) {
      embed.addFields({
        name: t("security.embed.userId", { defaultValue: "User ID" }),
        value: incident.userId,
        inline: true
      });
    }
    if (incident.metadata) {
      embed.addFields({
        name: t("security.embed.additionalInfo", { defaultValue: "Additional Information" }),
        value: `\`\`\`json
${JSON.stringify(incident.metadata, null, 2)}
\`\`\``,
        inline: false
      });
    }
    return embed;
  }
  /**
   * Alert administrators
   */
  async alertAdmins(incident) {
    try {
      const [guildSetting] = await getDatabase().select().from(guildSettings).where(eq(guildSettings.guildId, incident.guildId)).limit(1);
      if (!guildSetting || !guildSetting.securityAlertRole) return;
      const alertEmbed = this.createIncidentEmbed(incident);
      alertEmbed.setFooter({
        text: t("security.embed.footer", { defaultValue: "Immediate action may be required" })
      });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("security_acknowledge").setLabel(t("security.buttons.acknowledge", { defaultValue: "Acknowledge" })).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("security_investigate").setLabel(t("security.buttons.investigate", { defaultValue: "Investigate" })).setStyle(ButtonStyle.Danger)
      );
      if (this.securityChannel) {
        await this.securityChannel.send({
          content: `<@&${guildSetting.securityAlertRole}>`,
          embeds: [alertEmbed],
          components: [row]
        });
      }
    } catch (error) {
      logger.error("Failed to alert admins:", error);
    }
  }
  /**
   * Check for suspicious username patterns
   */
  hasSupiciousUsername(username) {
    const suspiciousPatterns = [
      /^[^a-zA-Z0-9]+$/,
      // Only special characters
      /(.)\1{4,}/,
      // Repeated characters
      /discord\.gg/i,
      // Invite links
      /\b(admin|mod|staff)\b/i,
      // Impersonation
      /\b(nitro|free|gift)\b/i,
      // Scam keywords
      /[\u0300-\u036f]{3,}/
      // Excessive diacritics
    ];
    return suspiciousPatterns.some((pattern) => pattern.test(username));
  }
  /**
   * Calculate username similarity
   */
  calculateUsernameSimilarity(usernames) {
    if (usernames.length < 2) return 0;
    let similarPairs = 0;
    let totalPairs = 0;
    for (let i = 0; i < usernames.length; i++) {
      for (let j = i + 1; j < usernames.length; j++) {
        totalPairs++;
        const similarity = this.stringSimilarity(usernames[i], usernames[j]);
        if (similarity > 0.8) {
          similarPairs++;
        }
      }
    }
    return totalPairs > 0 ? similarPairs / totalPairs : 0;
  }
  /**
   * Calculate string similarity
   */
  stringSimilarity(a, b) {
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;
    if (longer.length === 0) return 1;
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }
  /**
   * Calculate Levenshtein distance
   */
  levenshteinDistance(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }
  // Placeholder methods - implement based on your database schema
  async getRecentJoins(guildId, seconds) {
    const since = new Date(Date.now() - seconds * 1e3);
    const rows = await getDatabase().select({
      userId: members.userId,
      username: users.username
    }).from(members).innerJoin(users, eq(members.userId, users.id)).where(and(eq(members.guildId, guildId), gte(members.joinedAt, since))).orderBy(desc(members.joinedAt)).limit(100);
    return rows;
  }
  async getUserIncidents(userId, guildId, days) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1e3);
    const incidents = await getDatabase().select({
      type: securityLogs.action,
      createdAt: securityLogs.createdAt
    }).from(securityLogs).where(
      and(
        eq(securityLogs.userId, userId),
        eq(securityLogs.guildId, guildId),
        gte(securityLogs.createdAt, since)
      )
    ).orderBy(desc(securityLogs.createdAt));
    return incidents;
  }
  async getSecurityConfig(guildId) {
    const defaults = guildId === "global" ? DEFAULT_GLOBAL_SECURITY_CONFIG : DEFAULT_SECURITY_CONFIG;
    try {
      const [settings] = await getDatabase().select({
        securityEnabled: guildSettings.securityEnabled,
        antiSpamEnabled: guildSettings.antiSpamEnabled,
        antiRaidEnabled: guildSettings.antiRaidEnabled,
        maxMentions: guildSettings.maxMentions,
        maxDuplicates: guildSettings.maxDuplicates
      }).from(guildSettings).where(eq(guildSettings.guildId, guildId)).limit(1);
      if (!settings) {
        return defaults;
      }
      const suspiciousThreshold = Math.max(20, settings.maxMentions * 10);
      return {
        enabled: settings.securityEnabled,
        autoModEnabled: settings.securityEnabled && settings.antiSpamEnabled,
        antiSpamEnabled: settings.antiSpamEnabled,
        antiRaidEnabled: settings.antiRaidEnabled,
        maxMentions: settings.maxMentions,
        maxDuplicates: settings.maxDuplicates,
        suspiciousThreshold,
        blacklistSync: guildId === "global" ? defaults.blacklistSync : settings.securityEnabled
      };
    } catch (error) {
      logger.error(`Failed to load security config for guild ${guildId}:`, error);
      return defaults;
    }
  }
  async getGlobalSecurityConfig() {
    const config = await this.getSecurityConfig("global");
    return {
      ...config,
      blacklistSync: true
    };
  }
  async syncBlacklist(force = false) {
    if (!force) {
      const ttlExpired = Date.now() - this.lastBlacklistSync > SecurityService.BLACKLIST_CACHE_TTL;
      if (this.blacklistCache.size > 0 && !ttlExpired) {
        return;
      }
    }
    const activeEntries = await getDatabase().select({
      entityType: blacklist.entityType,
      entityId: blacklist.entityId
    }).from(blacklist).where(eq(blacklist.active, true));
    const cache = /* @__PURE__ */ new Map();
    for (const entry of activeEntries) {
      const set = this.getOrCreateEntitySet(cache, entry.entityType);
      set.add(entry.entityId);
    }
    this.blacklistCache = cache;
    this.lastBlacklistSync = Date.now();
    logger.info("Blacklist cache synchronised", { entries: activeEntries.length });
  }
  addToBlacklistCache(type, entityId) {
    const set = this.getOrCreateEntitySet(this.blacklistCache, type);
    set.add(entityId);
  }
  getOrCreateEntitySet(cache, type) {
    const existing = cache.get(type);
    if (existing) {
      return existing;
    }
    const created = /* @__PURE__ */ new Set();
    cache.set(type, created);
    return created;
  }
}
export const securityService = SecurityService.getInstance();
