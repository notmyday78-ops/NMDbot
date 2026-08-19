"use strict";
import {
  wordFilterRepository
} from "../repositories/wordFilterRepository";
import { logger } from "../utils/logger";
import { safeRegexMatch } from "../utils/regexUtils";
const CACHE_TTL_MS = 60 * 1e3;
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
export class WordFilterService {
  cache = /* @__PURE__ */ new Map();
  async listRules(guildId) {
    const cached = this.cache.get(guildId);
    const now = Date.now();
    if (Math.random() < 0.05) {
      for (const [k, v] of this.cache.entries()) {
        if (now - v.fetchedAt > CACHE_TTL_MS * 2) {
          this.cache.delete(k);
        }
      }
    }
    if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.rules;
    }
    const rules = await wordFilterRepository.list(guildId);
    this.cache.set(guildId, { fetchedAt: Date.now(), rules });
    return rules;
  }
  async getRule(guildId, ruleId) {
    return wordFilterRepository.getById(guildId, ruleId);
  }
  async createRule(data) {
    const rule = await wordFilterRepository.create(data);
    this.invalidateCache(data.guildId);
    return rule;
  }
  async updateRule(guildId, ruleId, data) {
    const rule = await wordFilterRepository.update(guildId, ruleId, data);
    this.invalidateCache(guildId);
    return rule;
  }
  async deleteRule(guildId, ruleId) {
    const removed = await wordFilterRepository.delete(guildId, ruleId);
    this.invalidateCache(guildId);
    return removed;
  }
  async findViolations(guildId, content) {
    const rules = await this.listRules(guildId);
    const violations = [];
    for (const rule of rules) {
      const matcher = this.buildMatcher(rule);
      if (!matcher) continue;
      const { matches } = safeRegexMatch(matcher.pattern, matcher.flags, content);
      if (matches.length > 0) {
        violations.push({ rule, matches });
      }
    }
    return violations;
  }
  inferDefaultActions(severity) {
    switch (severity) {
      case "low":
        return [{ type: "warn" }];
      case "medium":
        return [{ type: "warn" }, { type: "timeout", durationSeconds: 600 }];
      case "high":
        return [{ type: "timeout", durationSeconds: 1800 }, { type: "kick" }];
      case "critical":
        return [{ type: "timeout", durationSeconds: 3600 }, { type: "ban" }];
      default:
        return [{ type: "warn" }];
    }
  }
  invalidateCache(guildId) {
    this.cache.delete(guildId);
  }
  buildMatcher(rule) {
    const flags = rule.caseSensitive ? "g" : "gi";
    try {
      if (rule.matchType === "regex") {
        return { pattern: rule.pattern, flags };
      }
      const escaped = escapeRegExp(rule.pattern);
      const source = rule.wholeWord ? `\\b${escaped}\\b` : escaped;
      return { pattern: source, flags };
    } catch (error) {
      logger.warn(
        `Failed to build word filter matcher for guild ${rule.guildId} rule ${rule.id}:`,
        error
      );
      return null;
    }
  }
}
export const wordFilterService = new WordFilterService();
