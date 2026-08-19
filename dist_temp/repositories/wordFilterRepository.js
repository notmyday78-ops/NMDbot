"use strict";
import { and, eq } from "drizzle-orm";
import { getDatabase } from "../database/connection";
import { wordFilterRules } from "../database/schema";
function parseActions(actions) {
  if (!actions) {
    return [];
  }
  if (Array.isArray(actions)) {
    const parsed = [];
    for (const action of actions) {
      if (!action || typeof action !== "object") continue;
      const typed = action;
      if (!typed.type) continue;
      const clean = {
        type: typed.type
      };
      if (typeof typed.durationSeconds === "number") {
        clean.durationSeconds = typed.durationSeconds;
      }
      if (typeof typed.reason === "string") {
        clean.reason = typed.reason;
      }
      parsed.push(clean);
    }
    return parsed;
  }
  if (typeof actions === "string") {
    try {
      return parseActions(JSON.parse(actions));
    } catch {
      return [];
    }
  }
  return [];
}
function mapRule(record) {
  return {
    id: record.id,
    guildId: record.guildId,
    pattern: record.pattern,
    matchType: record.matchType,
    caseSensitive: record.caseSensitive,
    wholeWord: record.wholeWord,
    severity: record.severity,
    autoDelete: record.autoDelete,
    notifyChannelId: record.notifyChannelId ?? void 0,
    actions: parseActions(record.actions),
    createdBy: record.createdBy ?? void 0,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}
export class WordFilterRepository {
  get db() {
    return getDatabase();
  }
  async list(guildId) {
    const records = await this.db.select().from(wordFilterRules).where(eq(wordFilterRules.guildId, guildId));
    return records.map(mapRule);
  }
  async getById(guildId, ruleId) {
    const [record] = await this.db.select().from(wordFilterRules).where(and(eq(wordFilterRules.guildId, guildId), eq(wordFilterRules.id, ruleId))).limit(1);
    return record ? mapRule(record) : null;
  }
  async create(data) {
    const [record] = await this.db.insert(wordFilterRules).values({
      guildId: data.guildId,
      pattern: data.pattern,
      matchType: data.matchType ?? "literal",
      caseSensitive: data.caseSensitive ?? false,
      wholeWord: data.wholeWord ?? true,
      severity: data.severity ?? "medium",
      autoDelete: data.autoDelete ?? true,
      notifyChannelId: data.notifyChannelId,
      actions: data.actions ?? [],
      createdBy: data.createdBy
    }).returning();
    return mapRule(record);
  }
  async update(guildId, ruleId, data) {
    const updatePayload = {
      updatedAt: /* @__PURE__ */ new Date()
    };
    if (data.pattern !== void 0) updatePayload.pattern = data.pattern;
    if (data.matchType !== void 0) updatePayload.matchType = data.matchType;
    if (data.caseSensitive !== void 0) updatePayload.caseSensitive = data.caseSensitive;
    if (data.wholeWord !== void 0) updatePayload.wholeWord = data.wholeWord;
    if (data.severity !== void 0) updatePayload.severity = data.severity;
    if (data.autoDelete !== void 0) updatePayload.autoDelete = data.autoDelete;
    if (data.notifyChannelId !== void 0) updatePayload.notifyChannelId = data.notifyChannelId;
    if (data.actions !== void 0) updatePayload.actions = data.actions;
    const [record] = await this.db.update(wordFilterRules).set(updatePayload).where(and(eq(wordFilterRules.guildId, guildId), eq(wordFilterRules.id, ruleId))).returning();
    return record ? mapRule(record) : null;
  }
  async delete(guildId, ruleId) {
    const [record] = await this.db.delete(wordFilterRules).where(and(eq(wordFilterRules.guildId, guildId), eq(wordFilterRules.id, ruleId))).returning();
    return Boolean(record);
  }
}
export const wordFilterRepository = new WordFilterRepository();
