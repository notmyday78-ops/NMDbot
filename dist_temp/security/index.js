"use strict";
import {
  EmbedBuilder,
  WebhookClient,
  Colors,
  ApplicationCommandOptionType
} from "discord.js";
import { rateLimiterInstance, RateLimitPresets } from "../middleware/rateLimiter";
import { PermissionChecker } from "../middleware/permissions";
import { EnhancedSanitizer, sanitizeUserInput } from "../utils/sanitizer";
import { SchemaValidator } from "../validation/schemas";
import { logger } from "../utils/logger";
const defaultConfig = {
  enableRateLimiting: true,
  enablePermissionChecks: true,
  enableInputValidation: true,
  enableSanitization: true,
  enableAuditLogging: true,
  enableSecurityAlerts: true,
  alertWebhookUrl: process.env.SECURITY_WEBHOOK_URL,
  maxViolationsBeforeBan: 10,
  violationDecayTime: 36e5,
  // 1 hour
  trustedRoles: [],
  immuneUsers: [process.env.BOT_OWNER_ID].filter(Boolean)
};
export class SecurityManager {
  static instance;
  config;
  violations = /* @__PURE__ */ new Map();
  alertWebhook;
  constructor(config = {}) {
    this.config = { ...defaultConfig, ...config };
    if (this.config.alertWebhookUrl) {
      try {
        this.alertWebhook = new WebhookClient({ url: this.config.alertWebhookUrl });
      } catch (error) {
        logger.error("Failed to initialize security webhook:", error);
      }
    }
    setInterval(() => this.cleanupViolations(), 6e4);
  }
  static getInstance(config) {
    if (!SecurityManager.instance) {
      SecurityManager.instance = new SecurityManager(config);
    }
    return SecurityManager.instance;
  }
  /**
   * Main security check for commands
   */
  async validateCommand(interaction, command) {
    const userId = interaction.user.id;
    const guildId = interaction.guildId;
    if (!guildId) {
      return { allowed: false, reason: "Guild not found", checks: {} };
    }
    if (this.config.immuneUsers.includes(userId)) {
      return { allowed: true, checks: {} };
    }
    const checks = {};
    if (this.config.enableRateLimiting) {
      const rateLimitResult = this.checkRateLimit(
        userId,
        guildId,
        command.data.name,
        command.category
      );
      checks.rateLimit = rateLimitResult;
      if (!rateLimitResult.passed) {
        await this.recordViolation(userId, "rate_limit", interaction);
        return {
          allowed: false,
          reason: `Rate limited. Try again in ${Math.ceil((rateLimitResult.retryAfter || 0) / 1e3)} seconds.`,
          checks
        };
      }
    }
    if (this.config.enablePermissionChecks && command.permissions) {
      const permissionResult = await this.checkPermissions(interaction, command.permissions);
      checks.permissions = permissionResult;
      if (!permissionResult.passed) {
        await this.recordViolation(userId, "permission", interaction);
        return {
          allowed: false,
          reason: permissionResult.reason || "Insufficient permissions",
          checks
        };
      }
    }
    if (this.config.enableInputValidation) {
      const validationResult = this.validateInput(interaction);
      checks.validation = validationResult;
      if (!validationResult.passed) {
        await this.recordViolation(userId, "validation", interaction);
        return {
          allowed: false,
          reason: validationResult.reason || "Invalid input",
          checks
        };
      }
    }
    const violationCheck = this.checkViolations(userId);
    if (violationCheck.banned) {
      return {
        allowed: false,
        reason: "You have been temporarily banned due to security violations",
        checks
      };
    }
    if (this.config.enableAuditLogging) {
      logger.debug(
        `Security check passed for ${interaction.user.tag} executing ${command.data.name}`
      );
    }
    return { allowed: true, checks };
  }
  /**
   * Validate message content
   */
  async validateMessage(message) {
    if (message.author.bot) {
      return { allowed: true };
    }
    const content = message.content;
    const mentionCheck = EnhancedSanitizer.hasMassMentions(content);
    if (mentionCheck.detected) {
      await this.recordViolation(message.author.id, "mass_mention", message);
      await this.sendSecurityAlert(
        "Mass Mention Detected",
        `User ${message.author.tag} attempted mass mentions`,
        "high",
        {
          userId: message.author.id,
          guildId: message.guildId || "unknown",
          counts: mentionCheck.counts
        }
      );
      return {
        allowed: false,
        reason: "Mass mentions detected",
        shouldDelete: true,
        shouldTimeout: mentionCheck.counts.total > 20
      };
    }
    const spamCheck = EnhancedSanitizer.isSpam(content);
    if (spamCheck.isSpam) {
      await this.recordViolation(message.author.id, "spam", message);
      return {
        allowed: false,
        reason: "Message detected as spam",
        shouldDelete: true,
        shouldTimeout: spamCheck.score >= 4
      };
    }
    if (content.match(/[\w-]{24}\.[\w-]{6}\.[\w-]{27,}/)) {
      await this.sendSecurityAlert(
        "Discord Token Detected",
        `Possible Discord token leak in message`,
        "critical",
        {
          userId: message.author.id,
          guildId: message.guildId || "unknown",
          channelId: message.channelId
        }
      );
      return {
        allowed: false,
        reason: "Sensitive data detected",
        shouldDelete: true
      };
    }
    return { allowed: true };
  }
  /**
   * Check rate limits
   */
  checkRateLimit(userId, guildId, commandName, category) {
    const result = rateLimiterInstance.consumeHierarchical(
      userId,
      guildId,
      commandName,
      this.getRateLimitConfig(category)
    );
    return {
      passed: result.allowed,
      reason: result.allowed ? void 0 : `Rate limit exceeded at ${result.level} level`,
      retryAfter: result.result.msBeforeNext
    };
  }
  /**
   * Check permissions
   */
  async checkPermissions(interaction, requirements) {
    const result = await PermissionChecker.check(
      interaction,
      requirements
    );
    return {
      passed: result.allowed,
      reason: result.reason,
      details: {
        missingPermissions: result.missingPermissions,
        missingRoles: result.missingRoles
      }
    };
  }
  /**
   * Validate command input
   */
  validateInput(interaction) {
    const commandName = interaction.commandName;
    const subcommand = interaction.options.getSubcommand(false);
    const options = {};
    interaction.options.data.forEach((opt) => {
      if (opt.type === ApplicationCommandOptionType.Subcommand) {
        opt.options?.forEach((subOpt) => {
          if (typeof subOpt.value === "string") {
            options[subOpt.name] = sanitizeUserInput(subOpt.value);
          } else {
            options[subOpt.name] = subOpt.value;
          }
        });
      } else {
        if (typeof opt.value === "string") {
          options[opt.name] = sanitizeUserInput(opt.value);
        } else {
          options[opt.name] = opt.value;
        }
      }
    });
    const validation = SchemaValidator.validateCommand(commandName, subcommand, options);
    if (!validation.success) {
      return {
        passed: false,
        reason: validation.error
      };
    }
    for (const [key, value] of Object.entries(options)) {
      if (typeof value === "string") {
        if (value.includes("${") || value.includes("`")) {
          return {
            passed: false,
            reason: "Potential injection attempt detected"
          };
        }
        if (value.length > 4e3) {
          return {
            passed: false,
            reason: `Input too long for field ${key}`
          };
        }
      }
    }
    return { passed: true };
  }
  /**
   * Record security violation
   */
  async recordViolation(userId, type, context) {
    let record = this.violations.get(userId);
    if (!record) {
      record = {
        userId,
        violations: [],
        totalCount: 0,
        banned: false,
        bannedUntil: null
      };
      this.violations.set(userId, record);
    }
    record.violations.push({
      type,
      timestamp: Date.now(),
      guildId: "guildId" in context ? context.guildId || void 0 : context.guildId || void 0
    });
    record.totalCount++;
    if (record.totalCount >= this.config.maxViolationsBeforeBan) {
      record.banned = true;
      record.bannedUntil = Date.now() + 36e5;
      await this.sendSecurityAlert(
        "User Auto-Banned",
        `User reached violation threshold`,
        "critical",
        {
          userId,
          violationCount: record.totalCount,
          recentViolations: record.violations.slice(-5)
        }
      );
    }
    logger.warn(`Security violation recorded for ${userId}: ${type}`);
  }
  /**
   * Check user violations
   */
  checkViolations(userId) {
    const record = this.violations.get(userId);
    if (!record) {
      return { banned: false, count: 0 };
    }
    if (record.banned && record.bannedUntil && Date.now() > record.bannedUntil) {
      record.banned = false;
      record.bannedUntil = null;
    }
    return {
      banned: record.banned,
      count: record.totalCount
    };
  }
  /**
   * Send security alert
   */
  async sendSecurityAlert(title, description, severity, data) {
    if (!this.config.enableSecurityAlerts) {
      return;
    }
    const colors = {
      low: Colors.Blue,
      medium: Colors.Yellow,
      high: Colors.Orange,
      critical: Colors.Red
    };
    const embed = new EmbedBuilder().setTitle(`Security Alert: ${title}`).setDescription(description).setColor(colors[severity]).addFields({
      name: "Severity",
      value: severity.toUpperCase(),
      inline: true
    }).setTimestamp();
    if (data) {
      embed.addFields({
        name: "Details",
        value: `\`\`\`json
${JSON.stringify(data, null, 2).substring(0, 1e3)}\`\`\``,
        inline: false
      });
    }
    logger.warn(`SECURITY ALERT [${severity.toUpperCase()}]: ${title} - ${description}`);
    if (this.alertWebhook) {
      try {
        await this.alertWebhook.send({
          embeds: [embed],
          username: "Security Monitor"
        });
      } catch (error) {
        logger.error("Failed to send security alert:", error);
      }
    }
  }
  /**
   * Get rate limit config for category
   */
  getRateLimitConfig(category) {
    switch (category) {
      case "moderation":
        return RateLimitPresets.moderation;
      case "economy":
        return RateLimitPresets.economy;
      case "config":
        return RateLimitPresets.config;
      default:
        return RateLimitPresets.general;
    }
  }
  /**
   * Clean up old violations
   */
  cleanupViolations() {
    const now = Date.now();
    const decayTime = this.config.violationDecayTime;
    for (const [userId, record] of this.violations.entries()) {
      record.violations = record.violations.filter((v) => now - v.timestamp < decayTime);
      if (record.violations.length === 0 && !record.banned) {
        this.violations.delete(userId);
      }
    }
  }
  /**
   * Get security status for user
   */
  getUserSecurityStatus(userId) {
    const violations = this.violations.get(userId);
    const rateLimitStatus = rateLimiterInstance.getInstance().getStatus(`user:${userId}`);
    return {
      userId,
      violations: violations?.totalCount || 0,
      recentViolations: violations?.violations.slice(-10) || [],
      banned: violations?.banned || false,
      bannedUntil: violations?.bannedUntil || null,
      rateLimited: rateLimitStatus.limited,
      trustScore: this.calculateTrustScore(userId)
    };
  }
  /**
   * Calculate user trust score
   */
  calculateTrustScore(userId) {
    const violations = this.violations.get(userId);
    if (!violations) {
      return 1;
    }
    const violationPenalty = Math.min(violations.totalCount * 0.1, 0.9);
    const recentViolations = violations.violations.filter(
      (v) => Date.now() - v.timestamp < 864e5
      // 24 hours
    ).length;
    const recentPenalty = recentViolations * 0.15;
    return Math.max(0, 1 - violationPenalty - recentPenalty);
  }
}
export async function applySecurityMiddleware(interaction, command) {
  const security = SecurityManager.getInstance();
  return security.validateCommand(interaction, command);
}
export async function applyMessageSecurity(message) {
  const security = SecurityManager.getInstance();
  return security.validateMessage(message);
}
export const securityManager = SecurityManager.getInstance();
export default SecurityManager;
export * from "./audit";
export { Validator, CommandSchemas } from "./validator";
export * from "./rateLimiter";
export * from "./sanitizer";
export * from "./permissions";
export * from "./middleware";
export {
  SecurityError,
  RateLimitError,
  BlacklistError,
  SuspiciousActivityError,
  ValidationError as SecurityValidationError
} from "./errors";
export * from "./crypto";
