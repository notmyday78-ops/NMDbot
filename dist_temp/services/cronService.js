"use strict";
import { getDatabase } from "../database/connection";
import { userBirthdays, birthdaySettings } from "../database/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "../utils/logger";
import { triviaService } from "./triviaService";
import { socialFeedService } from "./socialFeedService";
export class CronService {
  client;
  birthdayInterval = null;
  triviaInterval = null;
  feedsInterval = null;
  constructor(client) {
    this.client = client;
  }
  startAll() {
    this.checkBirthdays();
    this.birthdayInterval = setInterval(() => this.checkBirthdays(), 60 * 60 * 1e3);
    this.checkTrivia();
    this.triviaInterval = setInterval(() => this.checkTrivia(), 5 * 60 * 1e3);
    this.checkFeeds();
    this.feedsInterval = setInterval(() => this.checkFeeds(), 15 * 60 * 1e3);
    logger.info("CronService started for Birthdays, Trivia, and Feeds");
  }
  stopAll() {
    if (this.birthdayInterval) clearInterval(this.birthdayInterval);
    if (this.triviaInterval) clearInterval(this.triviaInterval);
    if (this.feedsInterval) clearInterval(this.feedsInterval);
  }
  async checkBirthdays() {
    try {
      const today = /* @__PURE__ */ new Date();
      if (today.getUTCHours() !== 12) return;
      const day = today.getUTCDate();
      const month = today.getUTCMonth() + 1;
      const db = getDatabase();
      const birthdays = await db.select().from(userBirthdays).innerJoin(birthdaySettings, eq(userBirthdays.guildId, birthdaySettings.guildId)).where(
        and(
          eq(birthdaySettings.enabled, true),
          eq(userBirthdays.day, day),
          eq(userBirthdays.month, month)
        )
      );
      for (const b of birthdays) {
        if (!b.birthday_settings.channelId) continue;
        const channel = await this.client.channels.fetch(b.birthday_settings.channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) continue;
        const msg = b.birthday_settings.message.replace("{user}", `<@${b.user_birthdays.userId}>`);
        await channel.send({
          content: msg
        }).catch(() => null);
      }
    } catch (error) {
      logger.error("Error in checkBirthdays cron:", error);
    }
  }
  async checkTrivia() {
    await triviaService.checkScheduledGames();
  }
  async checkFeeds() {
    await socialFeedService.checkFeeds(this.client);
  }
}
