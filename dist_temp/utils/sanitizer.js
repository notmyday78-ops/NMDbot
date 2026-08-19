"use strict";
import { escapeMarkdown } from "discord.js";
import DOMPurify from "isomorphic-dompurify";
import { logger } from "./logger";
export class EnhancedSanitizer {
  // Security patterns
  static PATTERNS = {
    // Discord tokens (full pattern)
    discordToken: /[\w-]{24}\.[\w-]{6}\.[\w-]{27,}/g,
    // Webhook URLs
    webhook: /discord(?:app)?\.com\/api\/webhooks\/\d{17,19}\/[\w-]+/gi,
    // API keys (generic patterns)
    apiKey: /(?:api[_-]?key|apikey|api_secret|secret_key)[\s:=]+["']?[\w-]{20,}/gi,
    // Private keys
    privateKey: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC )?PRIVATE KEY-----/g,
    // IP addresses (v4 and v6)
    ipv4: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
    ipv6: /\b(?:[A-F0-9]{1,4}:){7}[A-F0-9]{1,4}\b/gi,
    // Email addresses
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    // Phone numbers (US format)
    phone: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    // Credit card numbers
    creditCard: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    // Social Security Numbers
    ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
    // Discord invites
    discordInvite: /(?:discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\/[\w-]+/gi,
    // URLs (for validation)
    url: /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/gi,
    // Suspicious patterns
    zeroWidth: /[\u200B-\u200D\uFEFF\u2060\u180E]/g,
    rtlOverride: /[\u202A-\u202E\u2066-\u2069]/g,
    // XSS patterns
    onEvent: /\bon\w+\s*=\s*["'][^"']*["']/gi,
    javascript: /javascript:/gi,
    dataUri: /data:(?!image\/(?:png|jpg|jpeg|gif|webp|svg\+xml))/gi,
    // SQL injection patterns
    sqlKeywords: /\b(union|select|insert|update|delete|drop|create|alter|exec|execute|script|javascript|eval)\b/gi,
    // Command injection patterns
    shellChars: /[;&|`$(){}[\]<>]/g,
    // Path traversal
    pathTraversal: /\.\.\/|\.\.\\|\.\./g,
    // Control characters (using string constructor to avoid ESLint issues)
    controlChars: new RegExp(String.raw`[\u0000-\u001F\u007F-\u009F]`, "g"),
    fileControlChars: new RegExp(String.raw`[\u0000-\u001F\u0080-\u009F]`, "g")
  };
  // Blocked domains for URL filtering
  static BLOCKED_DOMAINS = [
    // URL shorteners
    "bit.ly",
    "tinyurl.com",
    "goo.gl",
    "ow.ly",
    "t.co",
    "short.link",
    // IP loggers
    "grabify.link",
    "iplogger.org",
    "iplogger.com",
    "iplogger.ru",
    "2no.co",
    "yip.su",
    "blasze.tk",
    "blasze.com",
    "curiouscat.club",
    // Phishing
    "discord-nitro.com",
    "discord-gift.com",
    "discord-gifts.com",
    "discordgift.site",
    "discordgifts.site",
    "discord-airdrop.com",
    // Malware
    "adf.ly",
    "cur.lv",
    "zipansion.com",
    "adfoc.us"
  ];
  // Mass mention thresholds
  static MENTION_LIMITS = {
    users: 5,
    roles: 3,
    everyone: 1,
    total: 10
  };
  /**
   * Comprehensive input sanitization
   */
  static sanitize(input, options = {}) {
    if (!input || typeof input !== "string") {
      return "";
    }
    let sanitized = input;
    if (options.maxLength) {
      sanitized = this.truncate(sanitized, options.maxLength);
    }
    if (options.removeUnicode !== false) {
      sanitized = this.removeUnsafeUnicode(sanitized);
    }
    if (options.removeSensitive !== false) {
      sanitized = this.removeSensitiveData(sanitized);
    }
    if (options.escapeHtml !== false) {
      sanitized = this.escapeHtml(sanitized);
    }
    if (options.escapeMarkdown) {
      sanitized = escapeMarkdown(sanitized);
    }
    if (options.escapeMentions !== false) {
      sanitized = this.escapeMentions(sanitized);
    }
    if (options.filterUrls) {
      sanitized = this.filterUrls(sanitized);
    }
    if (options.preventSql) {
      sanitized = this.preventSqlInjection(sanitized);
    }
    if (options.preventCommand) {
      sanitized = this.preventCommandInjection(sanitized);
    }
    if (options.normalizeWhitespace) {
      sanitized = this.normalizeWhitespace(sanitized);
    }
    return sanitized;
  }
  /**
   * Remove unsafe Unicode characters
   */
  static removeUnsafeUnicode(text) {
    return text.replace(this.PATTERNS.zeroWidth, "").replace(this.PATTERNS.rtlOverride, "").replace(this.PATTERNS.controlChars, "");
  }
  /**
   * Remove sensitive data patterns
   */
  static removeSensitiveData(text) {
    return text.replace(this.PATTERNS.discordToken, "[TOKEN_REMOVED]").replace(this.PATTERNS.webhook, "[WEBHOOK_REMOVED]").replace(this.PATTERNS.apiKey, "[API_KEY_REMOVED]").replace(this.PATTERNS.privateKey, "[PRIVATE_KEY_REMOVED]").replace(this.PATTERNS.creditCard, "[CC_REMOVED]").replace(this.PATTERNS.ssn, "[SSN_REMOVED]").replace(this.PATTERNS.email, (match) => {
      const [local, domain] = match.split("@");
      return `${local[0]}***@${domain}`;
    }).replace(this.PATTERNS.phone, "[PHONE_REMOVED]").replace(this.PATTERNS.ipv4, "[IP_REMOVED]").replace(this.PATTERNS.ipv6, "[IP_REMOVED]");
  }
  /**
   * Escape HTML entities to prevent XSS
   */
  static escapeHtml(text) {
    const clean = DOMPurify.sanitize(text, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true
    });
    return clean.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;").replace(/\//g, "&#x2F;");
  }
  /**
   * Escape Discord mentions
   */
  static escapeMentions(text) {
    return text.replace(/@everyone/gi, "@\u200Beveryone").replace(/@here/gi, "@\u200Bhere").replace(/<@!?(\d{17,19})>/g, "\\<@$1\\>").replace(/<@&(\d{17,19})>/g, "\\<@&$1\\>").replace(/<#(\d{17,19})>/g, "\\<#$1\\>");
  }
  /**
   * Filter and validate URLs
   */
  static filterUrls(text) {
    return text.replace(this.PATTERNS.url, (match) => {
      try {
        const url = new URL(match);
        if (this.BLOCKED_DOMAINS.some((domain) => url.hostname.includes(domain))) {
          return "[BLOCKED_URL]";
        }
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          return "[SUSPICIOUS_URL]";
        }
        if (match.match(this.PATTERNS.dataUri)) {
          return "[DATA_URI_BLOCKED]";
        }
        return `<${match}>`;
      } catch {
        return "[INVALID_URL]";
      }
    });
  }
  /**
   * Prevent SQL injection attempts
   */
  static preventSqlInjection(text) {
    const hasSqlPattern = this.PATTERNS.sqlKeywords.test(text) && (text.includes(";") || text.includes("--") || text.includes("/*"));
    if (hasSqlPattern) {
      logger.warn(`Potential SQL injection attempt detected: ${text.substring(0, 50)}...`);
      return text.replace(this.PATTERNS.sqlKeywords, (match) => `[${match.toUpperCase()}_BLOCKED]`);
    }
    return text;
  }
  /**
   * Prevent command injection attempts
   */
  static preventCommandInjection(text) {
    if (this.PATTERNS.shellChars.test(text)) {
      return text.replace(this.PATTERNS.shellChars, (char) => `\\${char}`);
    }
    return text;
  }
  /**
   * Normalize whitespace
   */
  static normalizeWhitespace(text) {
    return text.replace(/\s+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  }
  /**
   * Truncate text safely
   */
  static truncate(text, maxLength) {
    if (text.length <= maxLength) {
      return text;
    }
    const truncated = text.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(" ");
    if (lastSpace > maxLength * 0.8) {
      return `${truncated.substring(0, lastSpace)}...`;
    }
    return `${truncated}...`;
  }
  /**
   * Check for mass mentions
   */
  static hasMassMentions(text) {
    const userMentions = (text.match(/<@!?\d{17,19}>/g) || []).length;
    const roleMentions = (text.match(/<@&\d{17,19}>/g) || []).length;
    const everyoneMentions = (text.match(/@everyone/gi) || []).length;
    const hereMentions = (text.match(/@here/gi) || []).length;
    const total = userMentions + roleMentions + everyoneMentions * 10 + hereMentions * 5;
    return {
      detected: userMentions > this.MENTION_LIMITS.users || roleMentions > this.MENTION_LIMITS.roles || everyoneMentions > 0 || total > this.MENTION_LIMITS.total,
      counts: {
        users: userMentions,
        roles: roleMentions,
        everyone: everyoneMentions,
        here: hereMentions,
        total
      }
    };
  }
  /**
   * Check for spam patterns
   */
  static isSpam(text) {
    const checks = {
      repeatedChars: /(.)\1{9,}/.test(text),
      excessiveCaps: text.length > 10 && (text.match(/[A-Z]/g) || []).length / text.length > 0.7,
      repeatedWords: /\b(\w+)\b(?:\s+\1){4,}/.test(text),
      excessiveEmojis: (text.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length > 20,
      excessiveLinks: (text.match(this.PATTERNS.url) || []).length > 5,
      suspiciousPatterns: /(?:free|win|claim|nitro|gift|prize)/gi.test(text) && this.PATTERNS.url.test(text)
    };
    const score = Object.values(checks).filter(Boolean).length;
    return {
      isSpam: score >= 2,
      score,
      reasons: Object.entries(checks).filter(([_, value]) => value).map(([key]) => key)
    };
  }
  /**
   * Validate and sanitize filenames
   */
  static sanitizeFilename(filename) {
    let safe = filename.replace(this.PATTERNS.pathTraversal, "");
    safe = safe.replace(/[<>:"|?*]/g, "_");
    safe = safe.replace(this.PATTERNS.fileControlChars, "");
    if (safe.length > 255) {
      const ext = safe.substring(safe.lastIndexOf("."));
      safe = safe.substring(0, 255 - ext.length) + ext;
    }
    const reserved = ["CON", "PRN", "AUX", "NUL", "COM1", "LPT1"];
    const nameWithoutExt = safe.substring(0, safe.lastIndexOf(".") || safe.length);
    if (reserved.includes(nameWithoutExt.toUpperCase())) {
      safe = `_${safe}`;
    }
    return safe || "unnamed";
  }
  /**
   * Validate file safety
   */
  static isFileSafe(filename, mimeType, size) {
    const issues = [];
    const ext = filename.substring(filename.lastIndexOf(".")).toLowerCase();
    const dangerousExtensions = [
      ".exe",
      ".scr",
      ".vbs",
      ".js",
      ".jar",
      ".bat",
      ".cmd",
      ".com",
      ".pif",
      ".msi",
      ".app",
      ".deb",
      ".rpm",
      ".dmg",
      ".pkg",
      ".run"
    ];
    if (dangerousExtensions.includes(ext)) {
      issues.push(`Dangerous file extension: ${ext}`);
    }
    if (mimeType) {
      const dangerousMimes = [
        "application/x-executable",
        "application/x-sharedlib",
        "application/x-msdownload",
        "application/x-msi",
        "application/x-sh",
        "application/x-batch"
      ];
      if (dangerousMimes.includes(mimeType)) {
        issues.push(`Dangerous MIME type: ${mimeType}`);
      }
    }
    if (size) {
      const maxSize = 8 * 1024 * 1024;
      if (size > maxSize) {
        issues.push(`File too large: ${(size / 1024 / 1024).toFixed(2)}MB`);
      }
      if (size === 0) {
        issues.push("Empty file");
      }
    }
    if ((filename.match(/\./g) || []).length > 1) {
      const parts = filename.split(".");
      if (parts.length > 2 && dangerousExtensions.includes(`.${parts[parts.length - 2]}`)) {
        issues.push("Double extension detected");
      }
    }
    return {
      safe: issues.length === 0,
      issues
    };
  }
}
export function sanitizeUserInput(input, maxLength = 2e3) {
  return EnhancedSanitizer.sanitize(input, {
    maxLength,
    removeSensitive: true,
    escapeHtml: true,
    escapeMentions: true,
    filterUrls: true,
    normalizeWhitespace: true
  });
}
export function sanitizeForDatabase(input) {
  return EnhancedSanitizer.sanitize(input, {
    removeSensitive: true,
    preventSql: true,
    escapeHtml: true
  });
}
export function sanitizeForDiscord(input) {
  return EnhancedSanitizer.sanitize(input, {
    escapeMentions: true,
    escapeMarkdown: false,
    filterUrls: true,
    maxLength: 2e3
  });
}
export function sanitizeCommandArgs(input) {
  return EnhancedSanitizer.sanitize(input, {
    preventCommand: true,
    preventSql: true,
    removeUnicode: true,
    normalizeWhitespace: true
  });
}
export default EnhancedSanitizer;
