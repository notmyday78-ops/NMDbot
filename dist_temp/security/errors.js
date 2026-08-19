"use strict";
import { EmbedBuilder } from "discord.js";
import { logger } from "../utils/logger";
export class SecurityError extends Error {
  code;
  severity;
  timestamp;
  context;
  constructor(message, code, severity = "medium", context) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.severity = severity;
    this.timestamp = /* @__PURE__ */ new Date();
    this.context = context;
    logger.error(`[${this.severity.toUpperCase()}] ${this.code}: ${message}`, context);
  }
  /**
   * Convert error to embed for Discord display
   */
  toEmbed() {
    const colors = {
      low: 65280,
      medium: 16776960,
      high: 16753920,
      critical: 16711680
    };
    return new EmbedBuilder().setColor(colors[this.severity]).setTitle("Security Error").setDescription(this.message).addFields(
      { name: "Error Code", value: this.code, inline: true },
      { name: "Severity", value: this.severity.toUpperCase(), inline: true }
    ).setTimestamp(this.timestamp);
  }
}
export class RateLimitError extends SecurityError {
  retryAfter;
  constructor(message, retryAfter, context) {
    super(message, "RATE_LIMIT_EXCEEDED", "low", context);
    this.retryAfter = retryAfter;
  }
}
export class PermissionError extends SecurityError {
  missingPermissions;
  constructor(message, missingPermissions = [], context) {
    super(message, "PERMISSION_DENIED", "medium", context);
    this.missingPermissions = missingPermissions;
  }
}
export class ValidationError extends SecurityError {
  field;
  value;
  constructor(message, field, value, context) {
    super(message, "VALIDATION_FAILED", "low", { ...context, field, value });
    this.field = field;
    this.value = value;
  }
}
export class AuthenticationError extends SecurityError {
  constructor(message, context) {
    super(message, "AUTHENTICATION_FAILED", "high", context);
  }
}
export class BlacklistError extends SecurityError {
  entityType;
  entityId;
  constructor(entityType, entityId, context) {
    super(`${entityType} ${entityId} is blacklisted`, "BLACKLISTED", "high", {
      ...context,
      entityType,
      entityId
    });
    this.entityType = entityType;
    this.entityId = entityId;
  }
}
export class SuspiciousActivityError extends SecurityError {
  activityType;
  constructor(activityType, message, context) {
    super(message, "SUSPICIOUS_ACTIVITY", "critical", { ...context, activityType });
    this.activityType = activityType;
  }
}
export class TokenCompromiseError extends SecurityError {
  constructor(message, context) {
    super(message, "TOKEN_COMPROMISE", "critical", context);
  }
}
export class SQLInjectionError extends SecurityError {
  query;
  constructor(query, context) {
    super("SQL injection attempt detected", "SQL_INJECTION_ATTEMPT", "critical", {
      ...context,
      query
    });
    this.query = query;
  }
}
export class XSSError extends SecurityError {
  payload;
  constructor(payload, context) {
    super("XSS attempt detected", "XSS_ATTEMPT", "high", { ...context, payload });
    this.payload = payload;
  }
}
export class SecurityErrorHandler {
  /**
   * Handle security error and return appropriate response
   */
  static handle(error) {
    if (error instanceof SecurityError) {
      const shouldAlert = error.severity === "critical" || error.severity === "high";
      return {
        message: this.getSafeErrorMessage(error),
        embed: error.toEmbed(),
        shouldLog: true,
        shouldAlert
      };
    }
    return {
      message: "An error occurred while processing your request.",
      shouldLog: true,
      shouldAlert: false
    };
  }
  /**
   * Get safe error message for user display
   */
  static getSafeErrorMessage(error) {
    switch (error.code) {
      case "RATE_LIMIT_EXCEEDED":
        return `You're doing that too fast! Please wait ${error.retryAfter} seconds.`;
      case "PERMISSION_DENIED":
        return "You don't have permission to do that.";
      case "VALIDATION_FAILED":
        return "Invalid input provided. Please check your input and try again.";
      case "BLACKLISTED":
        return "Access denied.";
      case "AUTHENTICATION_FAILED":
        return "Authentication failed. Please try again.";
      case "SUSPICIOUS_ACTIVITY":
      case "TOKEN_COMPROMISE":
      case "SQL_INJECTION_ATTEMPT":
      case "XSS_ATTEMPT":
        return "Security violation detected. This incident has been logged.";
      default:
        return "An error occurred. Please try again later.";
    }
  }
  /**
   * Create alert for critical security errors
   */
  static createAlert(error) {
    return new EmbedBuilder().setColor(16711680).setTitle("\u{1F6A8} Security Alert").setDescription(`A ${error.severity} severity security event has occurred`).addFields(
      { name: "Error Type", value: error.name, inline: true },
      { name: "Error Code", value: error.code, inline: true },
      { name: "Timestamp", value: error.timestamp.toISOString(), inline: false },
      { name: "Message", value: error.message, inline: false }
    ).setFooter({ text: "Immediate action may be required" }).setTimestamp();
  }
}
