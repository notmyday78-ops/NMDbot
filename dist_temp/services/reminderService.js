"use strict";
import { getDatabase } from "../database/connection";
import { reminders } from "../database/schema";
import { eq, gt, and } from "drizzle-orm";
import { logger } from "../utils/logger";
import schedule from "node-schedule";
import { EmbedFactory } from "../utils/EmbedFactory";
export class ReminderService {
  client = null;
  init(client) {
    this.client = client;
    void this.loadRemindersFromDatabase();
  }
  async loadRemindersFromDatabase() {
    if (!this.client) return;
    try {
      const db = getDatabase();
      const now = /* @__PURE__ */ new Date();
      const pendingReminders = await db.select().from(reminders).where(and(eq(reminders.completed, false), gt(reminders.fireAt, now)));
      for (const reminder of pendingReminders) {
        schedule.scheduleJob(reminder.id.toString(), reminder.fireAt, async () => {
          await this.triggerReminder(reminder);
        });
      }
      logger.info(`Loaded ${pendingReminders.length} pending reminders into node-schedule`);
    } catch (err) {
      logger.error("Failed to load reminders from database:", err);
    }
  }
  async triggerReminder(reminder) {
    if (!this.client) return;
    try {
      if (reminder.guildId && !this.client.guilds.cache.has(reminder.guildId)) return;
      const channel = await this.client.channels.fetch(reminder.channelId).catch(() => null);
      if (channel && channel.isTextBased()) {
        const embed = EmbedFactory.info(reminder.message, "\u23F0 Reminder");
        await channel.send({
          content: `<@${reminder.userId}>, here is your reminder!`,
          embeds: [embed]
        });
      }
      const db = getDatabase();
      await db.update(reminders).set({ completed: true }).where(eq(reminders.id, reminder.id));
    } catch (err) {
      logger.error(`Failed to process reminder ${reminder.id}:`, err);
    }
  }
  async createReminder(userId, guildId, channelId, message, fireAt) {
    const db = getDatabase();
    const result = await db.insert(reminders).values({
      userId,
      guildId,
      channelId,
      message,
      fireAt
    }).returning();
    const newReminder = result[0];
    schedule.scheduleJob(newReminder.id.toString(), fireAt, async () => {
      await this.triggerReminder(newReminder);
    });
  }
  destroy() {
    schedule.gracefulShutdown();
  }
}
export const reminderService = new ReminderService();
